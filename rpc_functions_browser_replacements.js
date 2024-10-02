require("dotenv").config();
const http = require("http");
const https = require("https");
const fs = require("fs");
const axios = require("axios");
const os = require("os");
const path = require("path");
const readline = require("readline");
const { URL } = require("url");
const axios = require("axios");
const Joi = require("joi");
const { SupernodeList } = require("./sequelize_data_models");
const { messageSchema, supernodeListSchema } = require("./validation_schemas");
const { logger, safeStringify } = require("./logger");
const { execSync, spawn } = require("child_process");
const storage = require("node-persist");
const { setPastelIdAndPassphrase } = require("./storage");
const Module = require("./libpastel_wasm.js");

// Create an instance of the Pastel class once the WebAssembly module is initialized:
let pastelInstance;
Module.onRuntimeInitialized = function () {
  pastelInstance = new Module.Pastel();
};

// Initialize the storage
storage.init();

PASTEL_OPENNODE_API_URL = "https://opennode-fastapi.pastel.network";

//Informational methods (implemented by checking opennode-fastapi endpoints)

async function getBalance(
  account = "*",
  minConf = 1,
  includeWatchOnly = false
) {
  try {
    const response = await axios.get(
      `${PASTEL_OPENNODE_API_URL}/get_address_balance`,
      {
        params: {
          addresses: [account],
        },
      }
    );
    const result = response.data;
    logger.info(`Got balance for account: ${account}`);
    return result.balance;
  } catch (error) {
    logger.error(`Error getting balance: ${safeStringify(error)}`);
    throw error;
  }
}

async function checkMasternodeTop() {
  try {
    const response = await axios.get(
      `${PASTEL_OPENNODE_API_URL}/masternode/top`
    );
    return response.data;
  } catch (error) {
    logger.error("Error in checkMasternodeTop:", error);
    throw error;
  }
}

async function getCurrentPastelBlockHeight() {
  try {
    const response = await axios.get(
      `${PASTEL_OPENNODE_API_URL}/getblockcount`
    );
    return response.data;
  } catch (error) {
    logger.error("Error in getCurrentPastelBlockHeight:", error);
    throw error;
  }
}

async function getBestBlockHashAndMerkleRoot() {
  try {
    const blockHeight = await getCurrentPastelBlockHeight();
    const response = await axios.get(
      `${PASTEL_OPENNODE_API_URL}/getblock/${blockHeight}`
    );
    const block = response.data;
    const bestBlockHash = block.hash;
    const bestBlockMerkleRoot = block.merkleroot;
    return [bestBlockHash, bestBlockMerkleRoot, blockHeight];
  } catch (error) {
    logger.error("Error in getBestBlockHashAndMerkleRoot:", error);
    throw error;
  }
}

async function getBlockHash(blockHeight) {
  try {
    const response = await axios.get(
      `${PASTEL_OPENNODE_API_URL}/getblockhash/${blockHeight}`
    );
    return response.data;
  } catch (error) {
    logger.error(
      `Error in getBlockHash for block height ${blockHeight}:`,
      error
    );
    throw error;
  }
}

async function getBlock(blockHash) {
  try {
    const response = await axios.get(
      `${PASTEL_OPENNODE_API_URL}/getblock/${blockHash}`
    );
    return response.data;
  } catch (error) {
    logger.error(`Error in getBlock for block hash ${blockHash}:`, error);
    throw error;
  }
}

async function getAndDecodeRawTransaction(txid, blockhash = null) {
  try {
    const response = await axios.get(
      `${PASTEL_OPENNODE_API_URL}/getrawtransaction/${txid}`
    );
    const rawTxData = response.data;
    const decodedTxData = await axios.get(
      `${PASTEL_OPENNODE_API_URL}/decoderawtransaction/${rawTxData}`
    );
    return decodedTxData.data;
  } catch (error) {
    logger.error(`Error in getAndDecodeRawTransaction for ${txid}:`, error);
    return {};
  }
}

async function listContractTickets(
  ticketTypeIdentifier,
  startingBlockHeight = 0
) {
  try {
    const response = await axios.get(
      `${PASTEL_OPENNODE_API_URL}/tickets/contract/list/${ticketTypeIdentifier}/${startingBlockHeight}`
    );
    const result = response.data;
    logger.info(
      `Listed contract tickets of type ${ticketTypeIdentifier} starting from block height ${startingBlockHeight}`
    );
    return result;
  } catch (error) {
    logger.error(
      `Error listing contract tickets of type ${ticketTypeIdentifier}. Error:`,
      safeStringify(error)
    );
    throw error;
  }
}

async function findContractTicket(key) {
  try {
    const response = await axios.get(
      `${PASTEL_OPENNODE_API_URL}/tickets/contract/find/${key}`
    );
    const result = response.data;
    logger.info(`Found contract ticket with key: ${key}`);
    return result;
  } catch (error) {
    logger.error(
      `Error finding contract ticket with key: ${key}. Error:`,
      safeStringify(error)
    );
    throw error;
  }
}

async function getContractTicket(txid, decodeProperties = true) {
  try {
    const response = await axios.get(
      `${PASTEL_OPENNODE_API_URL}/tickets/contract/get/${txid}?decode_properties=${decodeProperties}`
    );
    const result = response.data;
    if (result) {
      logger.info(`Got contract ticket with TXID: ${txid}`);
      return result;
    } else {
      logger.error(`Error getting contract ticket with TXID: ${txid}`);
      return null;
    }
  } catch (error) {
    logger.error(
      `Error getting contract ticket with TXID: ${txid}. Error:`,
      safeStringify(error)
    );
    throw error;
  }
}

async function listPastelIDTickets(filter = "mine", minheight = null) {
  try {
    const response = await axios.get(
      `${PASTEL_OPENNODE_API_URL}/tickets/id/list/${filter}/${minheight}`
    );
    const result = response.data;
    logger.info(`Pastel ID Tickets: ${result}`);
    logger.info(`Listed PastelID tickets with filter: ${filter}`);
    return result;
  } catch (error) {
    logger.error(
      `Error listing PastelID tickets with filter: ${filter}. Error:`,
      safeStringify(error)
    );
    throw error;
  }
}

async function isPastelIDRegistered(pastelID) {
  try {
    const response = await axios.get(
      `${PASTEL_OPENNODE_API_URL}/tickets/id/is_registered/${pastelID}`
    );
    return response.data;
  } catch (error) {
    logger.error(
      `Error checking if Pastel ID is registered: ${safeStringify(error)}`
    );
    return false;
  }
}

async function waitForTableCreation() {
  const maxRetries = 5;
  const retryDelay = 1000; // 1 second
  for (let i = 0; i < maxRetries; i++) {
    try {
      await SupernodeList.findOne();
      return; // Table exists, proceed with data insertion
    } catch (error) {
      if (
        error.name === "SequelizeDatabaseError" &&
        error.original.code === "SQLITE_ERROR" &&
        error.original.errno === 1
      ) {
        // Table doesn't exist, wait and retry
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
      } else {
        throw error; // Rethrow other errors
      }
    }
  }
  throw new Error("Table creation timed out.");
}

async function checkSupernodeList() {
  try {
    const response = await axios.get(
      `${PASTEL_OPENNODE_API_URL}/supernode_data`
    );
    const masternodeListFullDFJSON = response.data;
    const masternodeListFullDF = JSON.parse(masternodeListFullDFJSON);

    const validMasternodeListFullDF = Object.values(
      masternodeListFullDF
    ).filter(
      (data) =>
        ["ENABLED", "PRE_ENABLED"].includes(data.supernode_status) &&
        data["ipaddress:port"] !== "154.38.164.75:29933" &&
        data.extP2P
    );

    if (validMasternodeListFullDF.length === 0) {
      logger.error("No valid masternodes found.");
      return;
    }

    const validationSchema = Joi.array().items(supernodeListSchema);
    const validation = validationSchema.validate(validMasternodeListFullDF);
    if (validation.error) {
      throw new Error(`Validation error: ${validation.error.message}`);
    }

    // Wait for the table to be created before inserting data
    await waitForTableCreation();

    try {
      const _ = await SupernodeList.bulkCreate(validMasternodeListFullDF, {
        updateOnDuplicate: [
          "supernode_status",
          "protocol_version",
          "supernode_psl_address",
          "lastseentime",
          "activeseconds",
          "lastpaidtime",
          "lastpaidblock",
          "ipaddress:port",
          "rank",
          "pubkey",
          "extAddress",
          "extP2P",
          "extKey",
        ],
      });
    } catch (error) {
      logger.error("Failed to insert data:", error);
    }

    return { validMasternodeListFullDF, masternodeListFullDFJSON };
  } catch (error) {
    logger.error(`An error occurred: ${error.message}`);
  }
}

// Wallet methods (implemented by integrating with libpastel wasm)

function parseWasmResponse(responseFn) {
  try {
    return responseFn();
  } catch (error) {
    console.error("WASM Error:", error);
    throw error;
  }
}

async function verifyMessageWithPastelID(
  pastelid,
  messageToVerify,
  pastelIDSignatureOnMessage
) {
  try {
    const verificationResult = parseWasmResponse(() =>
      pastelInstance.VerifyWithPastelID(
        pastelid,
        messageToVerify,
        pastelIDSignatureOnMessage,
        "Mainnet"
      )
    );
    return verificationResult;
  } catch (error) {
    logger.error(`Error in verifyMessageWithPastelID: ${safeStringify(error)}`);
    throw error;
  }
}

async function signMessageWithPastelID(pastelid, messageToSign) {
  try {
    const signature = parseWasmResponse(() =>
      pastelInstance.SignWithPastelID(
        pastelid,
        messageToSign,
        "PastelID",
        "Mainnet"
      )
    );
    return signature;
  } catch (error) {
    logger.error(`Error in signMessageWithPastelID: ${safeStringify(error)}`);
    return null;
  }
}

async function createAndRegisterNewPastelID(passphraseForNewPastelID) {
  try {
    const newPastelIDObjString = parseWasmResponse(() =>
      pastelInstance.MakeNewPastelID()
    );
    const newPastelIDObj = JSON.parse(newPastelIDObjString);
    const newPastelID = newPastelIDObj.data;

    // Note: Registration process might need to be implemented separately

    return {
      success: true,
      PastelID: newPastelID,
    };
  } catch (error) {
    logger.error(
      `Error in createAndRegisterNewPastelID: ${safeStringify(error)}`
    );
    return { success: false, message: error.message };
  }
}

async function sendToAddress(
  fromAddress,
  toAddress,
  amount,
  comment = "",
  commentTo = "",
  subtractFeeFromAmount = false
) {
  try {
    // Note: The sample doesn't show a direct equivalent. This might need to be implemented differently.
    const txid = parseWasmResponse(() =>
      pastelInstance.SendFunds(
        fromAddress,
        toAddress,
        amount,
        comment,
        commentTo,
        subtractFeeFromAmount
      )
    );
    return { success: true, result: txid };
  } catch (error) {
    logger.error(`Error in sendToAddress: ${safeStringify(error)}`);
    return {
      success: false,
      message: `Error in sendToAddress: ${safeStringify(error)}`,
    };
  }
}

async function getNewAddress() {
  try {
    const newAddress = parseWasmResponse(() =>
      pastelInstance.MakeNewAddress(Module.NetworkMode.Mainnet)
    );
    return newAddress;
  } catch (error) {
    logger.error(`Error in getNewAddress: ${safeStringify(error)}`);
    throw error;
  }
}

async function importPrivKey(privateKey) {
  try {
    // Note: The sample doesn't show a direct equivalent. This might need to be implemented differently.
    parseWasmResponse(() => pastelInstance.ImportPrivateKey(privateKey));
    return true;
  } catch (error) {
    logger.error(`Error in importPrivKey: ${safeStringify(error)}`);
    throw error;
  }
}

async function importWallet(serializedWallet, password) {
  try {
    const walletData = JSON.parse(serializedWallet);
    if (!walletData.data) {
      throw new Error("Invalid wallet file structure");
    }
    parseWasmResponse(() => pastelInstance.ImportWallet(walletData.data));
    if (password) {
      parseWasmResponse(() => pastelInstance.UnlockWallet(password));
    }
    return true;
  } catch (error) {
    logger.error(`Error in importWallet: ${safeStringify(error)}`);
    throw error;
  }
}

async function exportWallet() {
  try {
    const content = parseWasmResponse(() => pastelInstance.ExportWallet());
    const parsedContent = JSON.parse(content);
    return JSON.stringify({ data: parsedContent.data });
  } catch (error) {
    logger.error(`Error in exportWallet: ${safeStringify(error)}`);
    throw error;
  }
}

async function createNewWallet(password) {
  try {
    const mnemonic = parseWasmResponse(() =>
      pastelInstance.CreateNewWallet(password)
    );
    return mnemonic;
  } catch (error) {
    logger.error(`Error in createNewWallet: ${safeStringify(error)}`);
    throw error;
  }
}

async function createAndRegisterNewPastelID(passphraseForNewPastelID) {
  try {
    const addressAmounts = pastelInstance.ListAddressAmounts();
    const registrationFee = 1000;
    const transactionFee = 0.1;
    const requiredBalance = registrationFee + transactionFee;
    let fundingAddress = Object.keys(addressAmounts).find(
      (addr) => addressAmounts[addr] >= requiredBalance
    );
    if (!fundingAddress) {
      const newAddress = pastelInstance.MakeNewAddress(
        Module.NetworkMode.Mainnet
      );
      return {
        success: false,
        message: `Error: You do not have enough PSL in your wallet in a single address to register a new PastelID. Get some PSL (either from mining, buying on an exchange, a faucet, etc.) and then send at least 1,001 PSL of it to the following new PSL address which has been created for you: ${newAddress}`,
      };
    }
    const newPastelID = pastelInstance.MakeNewPastelID();
    pastelInstance.SetPastelIDPassphrase(newPastelID, passphraseForNewPastelID);

    const updatedAddressAmounts = pastelInstance.ListAddressAmounts();
    fundingAddress = Object.keys(updatedAddressAmounts).find(
      (addr) => updatedAddressAmounts[addr] >= registrationFee
    );
    if (!fundingAddress) {
      return {
        success: false,
        message:
          "Error: No address found with enough PSL to register a new PastelID.",
      };
    }
    const registerTxid = pastelInstance.RegisterPastelID(
      newPastelID,
      fundingAddress
    );
    return {
      success: true,
      PastelID: newPastelID,
      PastelIDRegistrationTXID: registerTxid,
    };
  } catch (error) {
    logger.error(
      `Error in createAndRegisterNewPastelID: ${safeStringify(error)}`
    );
    return { success: false, message: error.message };
  }
}

async function sendMany(
  fromAddress,
  toAmounts,
  minConf = 1,
  comment = "",
  changeAddress = ""
) {
  try {
    const result = pastelInstance.SendMany(
      fromAddress,
      toAmounts,
      minConf,
      comment,
      changeAddress
    );
    return result;
  } catch (error) {
    logger.error(`Error in sendMany: ${safeStringify(error)}`);
    return null;
  }
}

async function checkPSLAddressBalance(addressToCheck) {
  try {
    const balance = pastelInstance.GetBalance(addressToCheck);
    return balance;
  } catch (error) {
    logger.error(`Error in checkPSLAddressBalance: ${safeStringify(error)}`);
    return null;
  }
}

async function checkIfAddressIsAlreadyImportedInLocalWallet(addressToCheck) {
  try {
    const addressAmounts = pastelInstance.ListAddressAmounts();
    const addressAmountsArray = Object.entries(addressAmounts).map(
      ([address, amount]) => ({ address, amount })
    );
    const filteredAddressAmounts = addressAmountsArray.filter(
      (entry) => entry.address === addressToCheck
    );
    return filteredAddressAmounts.length > 0;
  } catch (error) {
    logger.error(
      `Error in checkIfAddressIsAlreadyImportedInLocalWallet: ${safeStringify(
        error
      )}`
    );
    return false;
  }
}

async function getTransactionDetails(txid, includeWatchonly = false) {
  try {
    const transactionDetails = pastelInstance.GetTransaction(
      txid,
      includeWatchonly
    );
    logger.debug(
      `Retrieved transaction details for ${txid}:`,
      safeStringify(transactionDetails)
    );
    return transactionDetails;
  } catch (error) {
    logger.error(
      `Error retrieving transaction details for ${txid}:`,
      safeStringify(error)
    );
    return {};
  }
}

async function sendTrackingAmountFromControlAddressToBurnAddressToConfirmInferenceRequest(
  inferenceRequestId,
  creditUsageTrackingPSLAddress,
  creditUsageTrackingAmountInPSL,
  burnAddress
) {
  try {
    const amounts = {
      [burnAddress]: creditUsageTrackingAmountInPSL,
    };
    const txid = await sendMany(
      creditUsageTrackingPSLAddress,
      amounts,
      0,
      "Confirmation tracking transaction for inference request with request_id " +
        inferenceRequestId,
      creditUsageTrackingPSLAddress
    );
    if (txid) {
      logger.info(
        `Sent ${creditUsageTrackingAmountInPSL} PSL from ${creditUsageTrackingPSLAddress} to ${burnAddress} to confirm inference request ${inferenceRequestId}. TXID: ${txid}`
      );
      const transactionInfo = pastelInstance.GetTransaction(txid);
      if (transactionInfo) {
        return txid;
      } else {
        logger.error(
          `No transaction info found for TXID: ${txid} to confirm inference request ${inferenceRequestId}`
        );
      }
      return null;
    } else {
      logger.error(
        `Failed to send ${creditUsageTrackingAmountInPSL} PSL from ${creditUsageTrackingPSLAddress} to ${burnAddress} to confirm inference request ${inferenceRequestId}`
      );
      return null;
    }
  } catch (error) {
    logger.error(
      "Error in sendTrackingAmountFromControlAddressToBurnAddressToConfirmInferenceRequest:",
      error
    );
    throw error;
  }
}

async function importAddress(address, label = "", rescan = false) {
  try {
    pastelInstance.ImportAddress(address, label, rescan);
    logger.info(`Imported address: ${address}`);
  } catch (error) {
    logger.error(
      `Error importing address: ${address}. Error:`,
      safeStringify(error)
    );
  }
}
function formatNumberWithCommas(number) {
  return new Intl.NumberFormat("en-US").format(number);
}

async function getMyPslAddressWithLargestBalance() {
  try {
    const addressesString = parseWasmResponse(() =>
      pastelInstance.GetAddresses()
    );
    const addresses = JSON.parse(addressesString);
    // Note: There's no direct method to get balances, so we might need to implement this differently
    // For now, we'll just return the first address
    return addresses.data[0];
  } catch (error) {
    logger.error(
      `Error in getMyPslAddressWithLargestBalance: ${safeStringify(error)}`
    );
    throw error;
  }
}

async function getPastelIDs() {
  try {
    const pastelIDsString = parseWasmResponse(() =>
      pastelInstance.GetPastelIDs()
    );
    const pastelIDs = JSON.parse(pastelIDsString);
    return pastelIDs.data;
  } catch (error) {
    logger.error(`Error in getPastelIDs: ${safeStringify(error)}`);
    throw error;
  }
}

async function getWalletPubKey() {
  try {
    const pubKey = parseWasmResponse(() => pastelInstance.GetWalletPubKey());
    return pubKey;
  } catch (error) {
    logger.error(`Error in getWalletPubKey: ${safeStringify(error)}`);
    throw error;
  }
}

async function lockWallet() {
  try {
    parseWasmResponse(() => pastelInstance.LockWallet());
    return true;
  } catch (error) {
    logger.error(`Error in lockWallet: ${safeStringify(error)}`);
    throw error;
  }
}

async function unlockWallet(password) {
  try {
    parseWasmResponse(() => pastelInstance.UnlockWallet(password));
    return true;
  } catch (error) {
    logger.error(`Error in unlockWallet: ${safeStringify(error)}`);
    throw error;
  }
}

async function createAndFundNewPSLCreditTrackingAddress(
  amountOfPSLToFundAddressWith
) {
  try {
    const newCreditTrackingAddress = pastelInstance.MakeNewAddress(
      Module.NetworkMode.Mainnet
    );
    const sendResult = await sendToAddress(
      "",
      newCreditTrackingAddress,
      amountOfPSLToFundAddressWith,
      "Funding new credit tracking address",
      "",
      false
    );
    if (!sendResult.success) {
      logger.error(
        `Error funding new credit tracking address ${newCreditTrackingAddress} with ${formatNumberWithCommas(
          amountOfPSLToFundAddressWith
        )} PSL. Reason: ${sendResult.message}`
      );
      return null; // Or handle the error accordingly
    }
    logger.info(
      `Funded new credit tracking address ${newCreditTrackingAddress} with ${formatNumberWithCommas(
        amountOfPSLToFundAddressWith
      )} PSL. TXID: ${sendResult.result}`
    );
    return { newCreditTrackingAddress, txid: sendResult.result };
  } catch (error) {
    logger.error(
      `Error creating and funding new PSL credit tracking address: ${safeStringify(
        error
      )}`
    );
    throw error;
  }
}

async function createAndFundNewPSLCreditTrackingAddress(
  amountOfPSLToFundAddressWith
) {
  try {
    const newCreditTrackingAddress = pastelInstance.MakeNewAddress(
      Module.NetworkMode.Mainnet
    );
    const sendResult = await sendToAddress(
      "",
      newCreditTrackingAddress,
      amountOfPSLToFundAddressWith,
      "Funding new credit tracking address",
      "",
      false
    );
    if (!sendResult.success) {
      logger.error(
        `Error funding new credit tracking address ${newCreditTrackingAddress} with ${formatNumberWithCommas(
          amountOfPSLToFundAddressWith
        )} PSL. Reason: ${sendResult.message}`
      );
      return null; // Or handle the error accordingly
    }
    logger.info(
      `Funded new credit tracking address ${newCreditTrackingAddress} with ${formatNumberWithCommas(
        amountOfPSLToFundAddressWith
      )} PSL. TXID: ${sendResult.result}`
    );
    return { newCreditTrackingAddress, txid: sendResult.result };
  } catch (error) {
    logger.error(
      `Error creating and funding new PSL credit tracking address: ${safeStringify(
        error
      )}`
    );
    throw error;
  }
}

async function listPastelIDTicketsOld(filter = "mine", minheight = null) {
  try {
    const params = [filter];
    if (minheight !== null) {
      params.push(minheight);
    }
    const result = pastelInstance.ListPastelIDTickets(...params);
    logger.info(`Pastel ID Tickets: ${result}`);
    logger.info(`Listed PastelID tickets with filter: ${filter}`);
    return result;
  } catch (error) {
    logger.error(
      `Error listing PastelID tickets with filter: ${filter}. Error:`,
      safeStringify(error)
    );
    throw error;
  }
}

async function findPastelIDTicket(key) {
  try {
    const isConnectionReady = await waitForRPCConnection();
    if (!isConnectionReady) {
      logger.error("RPC connection is not available. Cannot proceed.");
      return;
    }
    const result = await rpc_connection.tickets("find", "id", key);
    logger.info(`Found PastelID ticket with key: ${key}`);
    return result;
  } catch (error) {
    logger.error(
      `Error finding PastelID ticket with key: ${key}. Error:`,
      safeStringify(error)
    );
    throw error;
  }
}

async function getPastelTicket(txid, decodeProperties = false) {
  try {
    const isConnectionReady = await waitForRPCConnection();
    if (!isConnectionReady) {
      logger.error("RPC connection is not available. Cannot proceed.");
      return;
    }
    const result = await rpc_connection.tickets("get", txid, decodeProperties);
    logger.info(`Got Pastel ticket with TXID: ${txid}`);
    return result;
  } catch (error) {
    logger.error(
      `Error getting Pastel ticket with TXID: ${txid}. Error:`,
      safeStringify(error)
    );
    throw error;
  }
}

async function listAddressAmounts(includeEmpty = false, isMineFilter = "all") {
  try {
    const isConnectionReady = await waitForRPCConnection();
    if (!isConnectionReady) {
      logger.error("RPC connection is not available. Cannot proceed.");
      return;
    }
    const result = await rpc_connection.listaddressamounts(
      includeEmpty,
      isMineFilter
    );
    logger.info(
      `Listed address amounts with includeEmpty: ${includeEmpty} and isMineFilter: ${isMineFilter}`
    );
    return result;
  } catch (error) {
    logger.error(`Error listing address amounts: ${safeStringify(error)}`);
    throw error;
  }
}

async function getWalletInfo() {
  try {
    const isConnectionReady = await waitForRPCConnection();
    if (!isConnectionReady) {
      logger.error("RPC connection is not available. Cannot proceed.");
      return;
    }
    const result = await rpc_connection.getwalletinfo();
    logger.info("Got wallet info");
    return result;
  } catch (error) {
    logger.error(`Error getting wallet info: ${safeStringify(error)}`);
    throw error;
  }
}

async function checkForRegisteredPastelID() {
  try {
    const { rpchost, rpcport, rpcuser, rpcpassword } = getLocalRPCSettings();
    logger.info(
      `RPC settings: host=${rpchost}, port=${rpcport}, user=${rpcuser}, password=${rpcpassword}`
    );
    const { network, burnAddress } = getNetworkInfo(rpcport);
    logger.info(`Network: ${network}, Burn Address: ${burnAddress}`);
    const pastelIDDir = getPastelIDDirectory(network);
    logger.info(`Pastel ID directory: ${pastelIDDir}`);
    const pastelIDs = await getPastelIDsFromDirectory(pastelIDDir);
    logger.info(`Found Pastel IDs: ${pastelIDs}`);
    for (const pastelID of pastelIDs) {
      const isRegistered = await isPastelIDRegistered(pastelID);
      logger.info(`Pastel ID ${pastelID} is registered: ${isRegistered}`);
      if (isRegistered) {
        logger.info(`Found registered Pastel ID: ${pastelID}`);
        return pastelID;
      }
    }
    logger.info("No registered Pastel ID found.");
    return null;
  } catch (error) {
    logger.error(
      `Error in checkForRegisteredPastelID: ${safeStringify(error)}`
    );
    throw error;
  }
}

function getNetworkInfo(rpcport) {
  let network = "";
  let burnAddress = "";
  if (rpcport === "9932") {
    network = "mainnet";
    burnAddress = "PtpasteLBurnAddressXXXXXXXXXXbJ5ndd";
  } else if (rpcport === "19932") {
    network = "testnet";
    burnAddress = "tPpasteLBurnAddressXXXXXXXXXXX3wy7u";
  } else if (rpcport === "29932") {
    network = "devnet";
    burnAddress = "44oUgmZSL997veFEQDq569wv5tsT6KXf9QY7";
  } else {
    throw new Error(`Unknown RPC port: ${rpcport}`);
  }
  return { network, burnAddress };
}

function getPastelIDDirectory(network) {
  const homeDir = process.env.HOME;
  let pastelIDDir = "";
  if (network === "mainnet") {
    pastelIDDir = path.join(homeDir, ".pastel", "pastelkeys");
  } else if (network === "testnet") {
    pastelIDDir = path.join(homeDir, ".pastel", "testnet3", "pastelkeys");
  } else if (network === "devnet") {
    pastelIDDir = path.join(homeDir, ".pastel", "devnet3", "pastelkeys");
  }
  return pastelIDDir;
}

async function getPastelIDsFromDirectory(directory) {
  const files = await fs.promises.readdir(directory);
  const pastelIDs = files.filter((file) => file.length === 87);
  return pastelIDs;
}

async function promptUserConfirmation(message) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(message + " ", (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function createAndRegisterPastelID(burnAddress) {
  try {
    const newPastelIDResult = await rpc_connection.pastelid("newkey");
    const newPastelID = newPastelIDResult.pastelid;
    const passphrase = newPastelIDResult.passphrase;
    const address = await rpc_connection.getnewaddress();
    const registrationResult = await registerPastelID(
      newPastelID,
      passphrase,
      address
    );
    if (registrationResult) {
      return newPastelID;
    } else {
      throw new Error("Failed to register new Pastel ID");
    }
  } catch (error) {
    logger.error(
      `Error creating and registering Pastel ID: ${safeStringify(error)}`
    );
    throw error;
  }
}

module.exports = {
  safeStringify,
  getLocalRPCSettings,
  JSONRPCException,
  AsyncAuthServiceProxy,
  initializeRPCConnection,
  waitForRPCConnection,
  checkMasternodeTop,
  getCurrentPastelBlockHeight,
  getBestBlockHashAndMerkleRoot,
  verifyMessageWithPastelID,
  sendToAddress,
  sendMany,
  checkPSLAddressBalance,
  checkIfAddressIsAlreadyImportedInLocalWallet,
  getAndDecodeRawTransaction,
  getTransactionDetails,
  sendTrackingAmountFromControlAddressToBurnAddressToConfirmInferenceRequest,
  importAddress,
  getBlockHash,
  getBlock,
  signMessageWithPastelID,
  createAndFundNewPSLCreditTrackingAddress,
  checkSupernodeList,
  checkForRegisteredPastelID,
  getLocalRPCSettings,
  getNetworkInfo,
  getPastelIDDirectory,
  getPastelIDsFromDirectory,
  isPastelIDRegistered,
  promptUserConfirmation,
  createAndRegisterPastelID,
  createAndRegisterNewPastelID,
  getBalance,
  getWalletInfo,
  getNewAddress,
  listAddressAmounts,
  getPastelTicket,
  listPastelIDTickets,
  findPastelIDTicket,
  getPastelTicket,
  listContractTickets,
  findContractTicket,
  getContractTicket,
  importPrivKey,
  importWallet,
  exportWallet,
  createNewWallet,
  getPastelIDs,
  getWalletPubKey,
  lockWallet,
  unlockWallet,
  registerPastelID,
  rpc_connection,
  stopPastelDaemon,
  startPastelDaemon,
  getMyPslAddressWithLargestBalance,
};
