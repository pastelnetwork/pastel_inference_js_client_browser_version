
// Need to replace with a call API
const port = 3100;

async function configureRPCAndSetBurnAddress() {
  // Need to replace with a call API
  const rpcport = '';
  try {
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

// Convert from "/get-network-info" api
// Output:
//  - Success: { success: true, network }
//  - Error: { success: false, message: "Failed to get network info" }
const getNetworkInfo = async () => {
  try {
    const rpcSettings = await getLocalRPCSettings();
    const rpcport = rpcSettings.rpcport;
    const network = getNetworkInfo(rpcport).network;
    return { success: true, network }
  } catch (error) {
    console.error("Error getting network info:", error);
    return { success: false, message: "Failed to get network info" }
  }
}

// Convert from "/get-best-supernode-url" api
// Input:
//    - userPastelID
// Output:
//  - Success:{ success: true, supernodeURL }
//  - Error: { success: false, error: "error message" }
const getBestSupernodeUrl = async ({ userPastelID }) => {
  try {
    const supernodeListDF = await checkSupernodeList();
    const { url: supernodeURL } = await getClosestSupernodeToPastelIDURL(
      userPastelID,
      supernodeListDF.validMasternodeListFullDF
    );
    if (!supernodeURL) {
      throw new Error("No valid supernode URL found.");
    }
    return { success: true, supernodeURL }
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Convert from "/get-inference-model-menu" api
// Output:
//  - Success: { success: true, modelMenu }
//  - Error: { success: false, error: "error message" }
const getInferenceModelMenu = async () => {
  try {
    const pastelData = await getCurrentPastelIdAndPassphrase();
    const MY_LOCAL_PASTELID = pastelData.pastelID;
    const MY_PASTELID_PASSPHRASE = pastelData.passphrase;
    if (!MY_LOCAL_PASTELID || !MY_PASTELID_PASSPHRASE) {
      return {
        success: false,
        error: "Pastel ID and passphrase not set.",
      };
    }
    const pastelInferenceClient = new PastelInferenceClient(
      MY_LOCAL_PASTELID,
      MY_PASTELID_PASSPHRASE
    );
    const { validMasternodeListFullDF } = await checkSupernodeList();
    const result = await getClosestSupernodeToPastelIDURL(
      MY_LOCAL_PASTELID,
      validMasternodeListFullDF
    );
    const modelMenu = await pastelInferenceClient.getModelMenu(
      result?.url
    );
    return { success: true, modelMenu };
  } catch (error) {
    logger.error(`Error in getInferenceModelMenu: ${safeStringify(error)}`);
    return { success: false, error: error.message };
  }
}

// Convert from "/estimate-credit-pack-cost" api
// Input:
//    - desiredNumberOfCredits
//    - creditPriceCushionPercentage
// Output:
//  - Success: { success: true, result }
//  - Error: { success: false, error: "error message" }
const estimateCreditPackCost = async ({ desiredNumberOfCredits, creditPriceCushionPercentage }) => {
  const { desiredNumberOfCredits, creditPriceCushionPercentage } = req.body;
  try {
    const result = await estimateCreditPackCostEndToEnd(
      desiredNumberOfCredits,
      creditPriceCushionPercentage
    );
    return { success: true, result };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Convert from "/send-message" api
// Input:
//    - toPastelID
//    - messageBody
// Output:
//  - Success: { success: true, messageDict }
//  - Error: { success: false, error: "error message" }
const sendMessage = async ({ toPastelID, messageBody }) => {
  try {
    const messageDict = await sendMessageAndCheckForNewIncomingMessages(
      toPastelID,
      messageBody
    );
    return { success: true, messageDict };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Convert from "/get-received-messages" api
// Output:
//  - Success: { success: true, messageDict }
//  - Error: { success: false, error: "error message" }
const getReceivedMessages = async () => {
  try {
    const messageDict = await checkForNewIncomingMessages();
    return { success: true, messageDict };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Convert from "/create-credit-pack-ticket" api
// Input:
//    - numCredits
//    - creditUsageTrackingPSLAddress
//    - maxTotalPrice
//    - maxPerCreditPrice
// Output:
//  - Success: { success: true, result }
//  - Error: { success: false, error: "error message" }
const createCreditPackTicket = async ({
  numCredits,
  creditUsageTrackingPSLAddress,
  maxTotalPrice,
  maxPerCreditPrice,
}) => {
  const burnAddress = await configureRPCAndSetBurnAddress();
  try {
    const result = await handleCreditPackTicketEndToEnd(
      numCredits,
      creditUsageTrackingPSLAddress,
      burnAddress,
      maxTotalPrice,
      maxPerCreditPrice
    );
    return { success: true, result };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Convert from "/credit-pack-info/:txid" api
// Input:
//    - txid
// Output:
//  - Success: { success: true, result }
//  - Error: { success: false, error: "error message" }
const getCreditPackInfo = async ({ txid }) => {
  try {
    const result = await getCreditPackTicketInfoEndToEnd(txid);
    return { success: true, result };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Convert from "/get-my-valid-credit-packs" api
// Output:
//  - Success: { success: true, result }
//  - Error: { success: false, error: "error message" }
const getMyValidCreditPacks = async () => {
  try {
    const result = await getMyValidCreditPackTicketsEndToEnd();
    return { success: true, result: result || [] };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Convert from "/get-my-psl-address-with-largest-balance" api
// Output:
//  - Success: { success: true, result }
//  - Error: { success: false, error: "error message" }
const getMyPslAddressWithLargestBalance = async () => {
  try {
    const result = await getMyPslAddressWithLargestBalance();
    return { success: true, result };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Convert from "/create-inference-request" api
// Input:
//    - model_inference_type_string
//    - model_parameters_json_b64
//    - model_input_data_json_b64
//    - creditPackTicketPastelTxid
//    - maximumInferenceCostInCredits
//    - requestedModelCanonicalString
// Output:
//  - Success: { success: true, result }
//  - Error: { success: false, error: "error message" }
const createInferenceRequest = async ({
  model_inference_type_string: modelInferenceTypeString,
  model_parameters_json_b64,
  model_input_data_json_b64,
  creditPackTicketPastelTxid,
  maximumInferenceCostInCredits,
  requestedModelCanonicalString,
}) => {
  try {
    const burnAddress = await configureRPCAndSetBurnAddress();
    const modelParameters = JSON.parse(
      Buffer.from(model_parameters_json_b64, "base64").toString()
    );
    const modelInputData = JSON.parse(
      Buffer.from(model_input_data_json_b64, "base64").toString()
    );
    console.log(`Model Inference Type: ${modelInferenceTypeString}`);
    const result = await handleInferenceRequestEndToEnd(
      creditPackTicketPastelTxid,
      modelInputData,
      requestedModelCanonicalString,
      modelInferenceTypeString,
      modelParameters,
      maximumInferenceCostInCredits,
      burnAddress
    );
    return { success: true, result };
  } catch (error) {
    console.error("Error in create-inference-request:", error);
    return { success: false, error: error.message };
  }
}

// Convert from "/check-supernode-list" api
// Output:
//  - Success: { success: true, result }
//  - Error: { success: false, error: "error message" }
const checkSupernodeList = async () => {
  try {
    const { validMasternodeListFullDF } = await checkSupernodeList();
    return { success: true, result: { validMasternodeListFullDF } };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Convert from "/register-pastel-id" api
// Input:
//    - pastelid
//    - passphrase
//    - address
// Output:
//  - Success: { success: true, result }
//  - Error: { success: false, error: "error message" }
const registerPastelID = async ({ pastelid, passphrase, address }) => {
  try {
    const result = await registerPastelID(pastelid, passphrase, address);
    return { success: true, result };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Convert from "/list-pastel-id-tickets" api
// Input:
//    - filter
//    - minheight
// Output:
//  - Success: { success: true, result }
//  - Error: { success: false, error: "error message" }
const getListPastelIdTickets = async ({ filter, minheight }) => {
  try {
    const result = await listPastelIDTickets(filter, minheight);
    console.log("Pastel ID Tickets:", result);
    return { success: true, result };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Convert from "/find-pastel-id-ticket/:key" api
// Input:
//    - key
// Output:
//  - Success: { success: true, result }
//  - Error: { success: false, error: "error message" }
const findPastelIDTicket = async ({ key }) => {
  try {
    const result = await findPastelIDTicket(key);
    return { success: true, result };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Convert from "/get-pastel-ticket/:txid" api
// Input:
//    - txid
//    - decodeProperties
// Output:
//  - Success: { success: true, result }
//  - Error: { success: false, error: "error message" }
const getPastelTicket = async ({ txid, decodeProperties }) => {
  try {
    const result = await getPastelTicket(txid, decodeProperties);
    return { success: true, result };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Convert from "/list-contract-tickets" api
// Input:
//    - ticketTypeIdentifier
//    - startingBlockHeight
// Output:
//  - Success: { success: true, result }
//  - Error: { success: false, error: "error message" }
const getListContractTickets = async ({ ticketTypeIdentifier, startingBlockHeight }) => {
  try {
    const result = await listContractTickets(
      ticketTypeIdentifier,
      startingBlockHeight
    );
    return { success: true, result };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Convert from "/find-contract-ticket/:key" api
// Input:
//    - key
// Output:
//  - Success: { success: true, result }
//  - Error: { success: false, error: "error message" }
const findContractTicket = async ({ key }) => {
  try {
    const result = await findContractTicket(key);
    return { success: true, result };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Convert from "/get-contract-ticket/:txid" api
// Input:
//    - txid
//    - decodeProperties
// Output:
//  - Success: { success: true, result }
//  - Error: { success: false, error: "error message" }
const getContractTicket = async ({ txid, decodeProperties }) => {
  try {
    const result = await getContractTicket(txid, decodeProperties);
    return { success: true, result };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Convert from "/import-priv-key" api
// Input:
//    - zcashPrivKey
//    - label
//    - rescan
// Output:
//  - Success: { success: true, result }
//  - Error: { success: false, error: "error message" }
const importPrivKey = async ({ zcashPrivKey, label = '', rescan = true }) => {
  try {
    const result = await importPrivKey(zcashPrivKey, label, rescan);
    return { success: true, result };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Convert from "/import-wallet" api
// Input:
//    - filename
// Output:
//  - Success: { success: true, result }
//  - Error: { success: false, error: "error message" }
const importWallet = async ({ filename }) => {
  try {
    const result = await importWallet(filename);
    return { success: true, result };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Convert from "/list-address-amounts" api
// Input:
//    - includeEmpty
//    - isMineFilter
// Output:
//  - Success: { success: true, result }
//  - Error: { success: false, error: "error message" }
const getListAddressAmounts = async ({ includeEmpty = false, isMineFilter = "all" }) => {
  try {
    const result = await listAddressAmounts(includeEmpty, isMineFilter);
    return { success: true, result };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Convert from "/get-balance" api
// Input:
//    - account
//    - minConf
//    - includeWatchOnly
// Output:
//  - Success: { success: true, result }
//  - Error: { success: false, error: "error message" }
const getBalance = async ({ account, minConf, includeWatchOnly }) => {
  try {
    const result = await getBalance(account, minConf, includeWatchOnly);
    return { success: true, result };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Convert from "/get-wallet-info" api
// Output:
//  - Success: { success: true, result }
//  - Error: { success: false, error: "error message" }
const getWalletInfo = async () => {
  try {
    const result = await getWalletInfo();
    return { success: true, result };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Convert from "/create-and-fund-new-address" api
// Input:
//    - amount
// Output:
//  - Success: { success: true, result }
//  - Error: { success: false, error: "error message" }
const createAndFundNewAddress = async ({ amount }) => {
  try {
    const result = await createAndFundNewPSLCreditTrackingAddress(amount);
    return { success: true, result };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Convert from "/check-for-pastel-id" api
// Input:
//    - autoRegister
// Output:
//  - Success: { success: true, result }
//  - Error: { success: false, error: "error message" }
const checkForPastelID = async ({ autoRegister }) => {
  try {
    const result = await checkForRegisteredPastelID(autoRegister);
    return { success: true, result };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Convert from "/import-pastel-id" api
// Input:
//    - file
// Output:
//  - Success: { success: true, message: "success message" }
//  - Error: { success: false, message: "error message" }
const importPastelID = async ({ file, network }) => {
  try {
    // ******************************
    // Need to replace with a call API
    const destFolder = getNetworkSpecificDestFolder(network);
    fs.mkdirSync(destFolder, { recursive: true });
    const sourceFilePath = file.path;
    const destFilePath = path.join(destFolder, file.originalname);
    fs.renameSync(sourceFilePath, destFilePath);

    await stopPastelDaemon();
    await startPastelDaemon();

    return {
      success: true,
      message: "PastelID imported successfully!",
    };
  } catch (error) {
    console.error("Error importing PastelID:", error);
    return { success: false, message: "Failed to import PastelID." };
  }
}

// Convert from "/create-and-register-pastel-id" api
// Input:
//    - passphraseForNewPastelID
// Output:
//  - Success: { success: true, message: 'success message }
//  - Error: { success: false, message: "error message" }
const createAndRegisterPastelID = async ({ passphraseForNewPastelID }) => {
  try {
    const result = await createAndRegisterNewPastelID(
      passphraseForNewPastelID
    );
    if (result.success) {
      return {
        success: true,
        PastelID: result.PastelID,
        PastelIDRegistrationTXID: result.PastelIDRegistrationTXID,
      };
    } else {
      return { success: false, message: result.message };
    }
  } catch (error) {
    logger.error(
      `Error in create-and-register-pastel-id: ${safeStringify(error)}`
    );
    return { success: false, message: error.message };
  }
}

// Convert from "/set-pastel-id-passphrase" api
// Input:
//    - pastelID
//    - passphrase
// Output:
//  - Success: { success: true }
//  - Error: { success: false, message: "error message" }
const setPastelIDPassphrase = async ({ pastelID, passphrase }) => {
  try {
    await setPastelIdAndPassphrase(pastelID, passphrase);
    // *********************************
    // Need to replace with a call API
    app.emit("pastelIDAndPassphraseSet");
    return { success: true };
  } catch (error) {
    console.error("Error setting PastelID and passphrase:", error);
    return {
        success: false,
        message: "Failed to set PastelID and passphrase",
      };
  }
}

// Can't convert to client browser
function getNetworkSpecificDestFolder(network) {
  if (network === "mainnet") {
    return path.join(process.env.HOME, ".pastel/pastelkeys");
  } else if (network === "testnet") {
    return path.join(process.env.HOME, ".pastel/testnet/pastelkeys");
  } else if (network === "devnet") {
    return path.join(process.env.HOME, ".pastel/devnet/pastelkeys");
  } else {
    throw new Error(`Unknown network: ${network}`);
  }
}
