const PASTEL_OPENNODE_API_URL = "https://opennode-fastapi.pastel.network";

let pastelInstance;
Module.onRuntimeInitialized = function () {
  pastelInstance = new Module.Pastel();
};

async function getLocalRPCSettings() {
  // TODO:
  let rpchost = "127.0.0.1";
  let rpcport = "19932";
  let rpcuser = "";
  let rpcpassword = "";
  return { rpchost, rpcport, rpcuser, rpcpassword, otherFlags };
}

function formatNumberWithCommas(number) {
  return new Intl.NumberFormat("en-US").format(number);
}

function parseWasmResponse(responseFn) {
  try {
    return responseFn();
  } catch (error) {
    console.error("WASM Error:", error);
    throw error;
  }
}

async function getNetworkInfo(rpcport = "9932") {
  let network = "";
  if (rpcport === "9932") {
    network = "mainnet";
  } else if (rpcport === "19932") {
    network = "testnet";
  } else if (rpcport === "29932") {
    network = "devnet";
  } else {
    throw new Error(`Unknown RPC port: ${rpcport}`);
  }
  return { network };
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
    console.error(
      `Error in createAndRegisterNewPastelID: `, error
    );
    return { success: false, message: error.message };
  }
}

async function importPastelID(network, formData) {
  return axios.post(
    `${API_URL}/import-pastel-id?network=${network}`,
    formData
  );
}

async function getMyPslAddressWithLargestBalance() {
  try {
    const addressesString = parseWasmResponse(() =>
      pastelInstance.GetAddresses()
    );
    const addresses = JSON.parse(addressesString);

    // Note: There's no direct method to get balances, so we might need to implement this differently
    // For now, we'll just return the first address
    return addresses[0];
  } catch (error) {
    logger.error(
      `Error in getMyPslAddressWithLargestBalance: ${safeStringify(error)}`
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

async function fetchValidPastelIDs() {
  try {
    const response = await listPastelIDTickets();
    return response.result.map((ticket) => ticket.ticket.pastelID);
  } catch (error) {
    console.error("Error retrieving Pastel ID tickets:", error);
    return [];
  }
}

async function setPastelIDPassphrase(pastelID, passphrase) {
  localStorage.setItem("MY_LOCAL_PASTELID", pastelID);
  localStorage.setItem("MY_PASTELID_PASSPHRASE", passphrase);
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

async function listAddressAmounts(includeEmpty = false, isMineFilter = "all") {
  try {
    const result = pastelInstance.ListAddressAmounts(includeEmpty, isMineFilter);
    logger.info(
      `Listed address amounts with includeEmpty: ${includeEmpty} and isMineFilter: ${isMineFilter}`
    );
    return { success: true, result };
  } catch (error) {
    logger.error(`Error listing address amounts: ${safeStringify(error)}`);
    throw error;
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

async function configureRPCAndSetBurnAddress() {
  try {
    const { rpcport } = await getLocalRPCSettings();
    let burnAddress;
    if (rpcport === "9932") {
      burnAddress = "PtpasteLBurnAddressXXXXXXXXXXbJ5ndd";
    } else if (rpcport === "19932") {
      burnAddress = "tPpasteLBurnAddressXXXXXXXXXXX3wy7u";
    } else if (rpcport === "29932") {
      burnAddress = "44oUgmZSL997veFEQDq569wv5tsT6KXf9QY7";
    } else {
      throw new Error(`Unsupported RPC port: ${rpcport}`);
    }
    return burnAddress;
  } catch (error) {
    console.error("Failed to configure RPC or set burn address:", error);
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
    return { success: true, result: { newCreditTrackingAddress, txid: sendResult.result } };
  } catch (error) {
    logger.error(
      `Error creating and funding new PSL credit tracking address: ${safeStringify(
        error
      )}`
    );
    throw error;
  }
}

async function createCreditPackTicket({
  numCredits,
  creditUsageTrackingPSLAddress,
  maxTotalPrice,
  maxPerCreditPrice,
}) {
  const burnAddress = await configureRPCAndSetBurnAddress();
  const result = await handleCreditPackTicketEndToEnd(
    numCredits,
    creditUsageTrackingPSLAddress,
    burnAddress,
    maxTotalPrice,
    maxPerCreditPrice
  );

  return { success: true, result }
}