// main.js

import { BrowserRPCReplacement } from "./BrowserRPCReplacement.js";
import { BrowserDatabase } from "./BrowserDatabase.js";
import PastelInferenceClient from "./pastel_inference_client_browser_client.js";
import {
  getNetworkFromLocalStorage,
  setNetworkInLocalStorage,
} from "./storage_browser_client.js";
import * as endToEndFunctions from "./end_to_end_functions_browser_client.js";
import * as utils from "./utility_functions_browser_replacements.js";
import * as globals from "./globals.js";
import * as storage from "./storage_browser_client.js";
import * as schemas from "./validation_schemas_browser_client.js";

const rpc = new BrowserRPCReplacement();
const db = new BrowserDatabase();

let network;
let burnAddress;

// Initialize the application
async function initializeApp() {
  await db.initializeDatabase();
  await rpc.initializeRPCConnection();
  const { network: configuredNetwork, burnAddress: configuredBurnAddress } =
    await configureRPCAndSetBurnAddress();
  network = configuredNetwork;
  burnAddress = configuredBurnAddress;

  const { pastelID, passphrase } =
    await storage.getCurrentPastelIdAndPassphrase();
  if (pastelID && passphrase) {
    globals.setPastelIdAndPassphrase(pastelID, passphrase);
    console.log(`Successfully set global PastelID`);
  } else {
    console.warn(`Failed to set global PastelID and passphrase from storage`);
  }

  const { validMasternodeListFullDF } = await rpc.checkSupernodeList();
  if (!validMasternodeListFullDF) {
    throw new Error(
      "The Pastel Daemon is not fully synced, and thus the Supernode information commands are not returning complete information. Finish fully syncing and try again."
    );
  }
}

async function changeNetwork(newNetwork) {
  if (["Mainnet", "Testnet", "Devnet"].includes(newNetwork)) {
    await setNetworkInLocalStorage(newNetwork);
    const { network: configuredNetwork, burnAddress: configuredBurnAddress } =
      await configureRPCAndSetBurnAddress();
    network = configuredNetwork;
    burnAddress = configuredBurnAddress;
    // You might want to reinitialize some parts of the app here
    await rpc.initializeRPCConnection(); // Reconnect with new network settings
    // ... any other necessary reinitialization
    return { success: true, message: `Network changed to ${newNetwork}` };
  } else {
    return { success: false, message: "Invalid network specified" };
  }
}

async function configureRPCAndSetBurnAddress() {
  let network = await getNetworkFromLocalStorage();
  if (!network) {
    // Default to mainnet if not set
    network = "Mainnet";
    await setNetworkInLocalStorage(network);
  }

  let burnAddress;
  switch (network) {
    case "Mainnet":
      burnAddress = "PtpasteLBurnAddressXXXXXXXXXXbJ5ndd";
      break;
    case "Testnet":
      burnAddress = "tPpasteLBurnAddressXXXXXXXXXXX3wy7u";
      break;
    case "Devnet":
      burnAddress = "44oUgmZSL997veFEQDq569wv5tsT6KXf9QY7";
      break;
    default:
      throw new Error(`Unsupported network: ${network}`);
  }

  return { network, burnAddress };
}

async function getNetworkInfo() {
  return { network };
}

async function getBestSupernodeUrl(userPastelID) {
  const supernodeListDF = await rpc.checkSupernodeList();
  const { url: supernodeURL } = await utils.getClosestSupernodeToPastelIDURL(
    userPastelID,
    supernodeListDF.validMasternodeListFullDF
  );
  if (!supernodeURL) {
    throw new Error("No valid supernode URL found.");
  }
  return supernodeURL;
}

async function getInferenceModelMenu() {
  const pastelID = globals.getPastelId();
  const passphrase = globals.getPassphrase();
  if (!pastelID || !passphrase) {
    throw new Error("Pastel ID and passphrase not set.");
  }
  const pastelInferenceClient = new PastelInferenceClient(pastelID, passphrase);
  return await pastelInferenceClient.getModelMenu();
}

async function estimateCreditPackCost(
  desiredNumberOfCredits,
  creditPriceCushionPercentage
) {
  return await endToEndFunctions.estimateCreditPackCostEndToEnd(
    desiredNumberOfCredits,
    creditPriceCushionPercentage
  );
}

async function sendMessage(toPastelID, messageBody) {
  return await endToEndFunctions.sendMessageAndCheckForNewIncomingMessages(
    toPastelID,
    messageBody
  );
}

async function getReceivedMessages() {
  return await endToEndFunctions.checkForNewIncomingMessages();
}

async function createCreditPackTicket(
  numCredits,
  creditUsageTrackingPSLAddress,
  maxTotalPrice,
  maxPerCreditPrice
) {
  return await endToEndFunctions.handleCreditPackTicketEndToEnd(
    numCredits,
    creditUsageTrackingPSLAddress,
    burnAddress,
    maxTotalPrice,
    maxPerCreditPrice
  );
}

async function getCreditPackInfo(txid) {
  return await endToEndFunctions.getCreditPackTicketInfoEndToEnd(txid);
}

async function getMyValidCreditPacks() {
  return await endToEndFunctions.getMyValidCreditPackTicketsEndToEnd();
}

async function getMyPslAddressWithLargestBalance() {
  return await rpc.getMyPslAddressWithLargestBalance();
}

async function createInferenceRequest(params) {
  return await endToEndFunctions.handleInferenceRequestEndToEnd(
    params.creditPackTicketPastelTxid,
    params.modelInputData,
    params.requestedModelCanonicalString,
    params.modelInferenceTypeString,
    params.modelParameters,
    params.maximumInferenceCostInCredits,
    burnAddress
  );
}

async function checkSupernodeList() {
  return await rpc.checkSupernodeList();
}

async function registerPastelID(pastelid, passphrase, address) {
  return await rpc.registerPastelID(pastelid, passphrase, address);
}

async function listPastelIDTickets(filter, minheight) {
  return await rpc.listPastelIDTickets(filter, minheight);
}

async function findPastelIDTicket(key) {
  return await rpc.findPastelIDTicket(key);
}

async function getPastelTicket(txid, decodeProperties) {
  return await rpc.getPastelTicket(txid, decodeProperties);
}

async function listContractTickets(ticketTypeIdentifier, startingBlockHeight) {
  return await rpc.listContractTickets(
    ticketTypeIdentifier,
    startingBlockHeight
  );
}

async function findContractTicket(key) {
  return await rpc.findContractTicket(key);
}

async function getContractTicket(txid, decodeProperties) {
  return await rpc.getContractTicket(txid, decodeProperties);
}

async function importPrivKey(zcashPrivKey, label, rescan) {
  return await rpc.importPrivKey(zcashPrivKey, label, rescan);
}

async function importWallet(serializedWallet) {
  return await rpc.importWallet(serializedWallet);
}

async function listAddressAmounts(includeEmpty, isMineFilter) {
  return await rpc.listAddressAmounts(includeEmpty, isMineFilter);
}

async function getBalance() {
  return await rpc.getBalance();
}

async function getWalletInfo() {
  return await rpc.getWalletInfo();
}

async function createAndFundNewAddress(amount) {
  return await rpc.createAndFundNewPSLCreditTrackingAddress(amount);
}

async function checkForPastelID(autoRegister) {
  return await rpc.checkForRegisteredPastelID(autoRegister);
}

async function isCreditPackConfirmed(txid) {
  return await rpc.isCreditPackConfirmed(txid);
}

async function createAndRegisterPastelID(passphraseForNewPastelID) {
  return await rpc.createAndRegisterNewPastelID(passphraseForNewPastelID);
}

async function isPastelIDRegistered(pastelID) {
  return await rpc.isPastelIDRegistered(pastelID);
}

async function setPastelIdAndPassphrase(pastelID, passphrase) {
  await storage.setPastelIdAndPassphrase(pastelID, passphrase);
  globals.setPastelIdAndPassphrase(pastelID, passphrase);
}

async function ensureMinimalPSLBalance(addresses) {
  return await rpc.ensureTrackingAddressesHaveMinimalPSLBalance(addresses);
}

async function checkPastelIDValidity(pastelID) {
  return await rpc.isPastelIDRegistered(pastelID);
}

async function dumpPrivKey(tAddr) {
  return await rpc.dumpPrivKey(tAddr);
}

async function verifyPastelID(pastelID, passphrase) {
  const testMessage = "Verification test message";
  const signature = await rpc.signMessageWithPastelID(
    pastelID,
    testMessage,
    passphrase
  );
  return await rpc.verifyMessageWithPastelID(pastelID, testMessage, signature);
}

async function verifyTrackingAddress(address) {
  const balance = await rpc.checkPSLAddressBalance(address);
  return balance !== undefined;
}

async function checkTrackingAddressBalance(
  creditPackTicketId,
  pastelID,
  passphrase
) {
  const creditPackInfo = await getCreditPackInfo(creditPackTicketId);
  if (!creditPackInfo || !creditPackInfo.requestConfirmation) {
    throw new Error("Credit pack ticket not found or invalid");
  }
  const trackingAddress =
    creditPackInfo.requestConfirmation.credit_usage_tracking_psl_address;
  if (!trackingAddress) {
    throw new Error("Tracking address not found in credit pack ticket");
  }
  const balance = await rpc.checkPSLAddressBalance(trackingAddress);
  if (balance === undefined) {
    throw new Error("Failed to retrieve balance for the tracking address");
  }
  return { address: trackingAddress, balance: balance };
}

export {
  initializeApp,
  changeNetwork,
  getNetworkInfo,
  getBestSupernodeUrl,
  getInferenceModelMenu,
  estimateCreditPackCost,
  sendMessage,
  getReceivedMessages,
  createCreditPackTicket,
  getCreditPackInfo,
  getMyValidCreditPacks,
  getMyPslAddressWithLargestBalance,
  createInferenceRequest,
  checkSupernodeList,
  registerPastelID,
  listPastelIDTickets,
  findPastelIDTicket,
  getPastelTicket,
  listContractTickets,
  findContractTicket,
  getContractTicket,
  importPrivKey,
  importWallet,
  listAddressAmounts,
  getBalance,
  getWalletInfo,
  createAndFundNewAddress,
  checkForPastelID,
  isCreditPackConfirmed,
  createAndRegisterPastelID,
  isPastelIDRegistered,
  setPastelIdAndPassphrase,
  ensureMinimalPSLBalance,
  checkPastelIDValidity,
  dumpPrivKey,
  verifyPastelID,
  verifyTrackingAddress,
  checkTrackingAddressBalance,
};
