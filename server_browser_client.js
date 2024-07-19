const express = require("express");
const multer = require("multer");
const bodyParser = require("body-parser");
const WebSocket = require("ws");
const os = require("os");
const path = require("path");
const fs = require("fs");
const {
  getCurrentPastelIdAndPassphrase,
  setPastelIdAndPassphrase,
} = require("./storage");
const { PastelInferenceClient } = require("./pastel_inference_client");

const {
  checkForNewIncomingMessages,
  sendMessageAndCheckForNewIncomingMessages,
  handleCreditPackTicketEndToEnd,
  getCreditPackTicketInfoEndToEnd,
  getMyValidCreditPackTicketsEndToEnd,
  handleInferenceRequestEndToEnd,
  estimateCreditPackCostEndToEnd,
} = require("./end_to_end_functions");
const {
  getLocalRPCSettings,
  getNetworkInfo,
  initializeRPCConnection,
  createAndFundNewPSLCreditTrackingAddress,
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
  getNewAddress,
  checkForRegisteredPastelID,
  createAndRegisterNewPastelID,
  stopPastelDaemon,
  startPastelDaemon,
  getMyPslAddressWithLargestBalance
} = require("./rpc_functions");
const { logger, logEmitter, logBuffer, safeStringify } = require("./logger");
const {
  prettyJSON,
  getClosestSupernodeToPastelIDURL,
  getNClosestSupernodesToPastelIDURLs,
} = require("./utility_functions");

let MY_LOCAL_PASTELID = "";
let MY_PASTELID_PASSPHRASE = "";

// Can't convert to client browser
const app = express();
app.use(bodyParser.urlencoded({ extended: true, limit: "50mb" }));
app.use(bodyParser.json({ limit: "50mb" }));
const upload = multer({ dest: "uploads/" });

const port = process.env.CLIENT_PORT || 3100;
const webSocketPort = process.env.CLIENT_WEBSOCKET_PORT || 3101;

// Can't convert to client browser
const wss = new WebSocket.Server({ port: webSocketPort }, () => {
  console.log(`WebSocket server started on port ${webSocketPort}`);
});

// Can't convert to client browser
function getServerIpAddress() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === "IPv4" && !iface.internal) {
        return iface.address;
      }
    }
  }
  return "localhost";
}

const getWsUrl = () => {
  const ipAddress = getServerIpAddress();
  const wsUrl = `ws://${ipAddress}:${webSocketPort}`;
  return {
    wsUrl,
  }
}

// Can't convert to client browser
wss.on("connection", (ws) => {
  logger.info(`Client connected: ${ws}`);

  logBuffer.forEach((logEntry) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(logEntry);
    }
  });

  const logListener = (logEntry) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(logEntry);
    }
  };
  logEmitter.on("newLog", logListener);

  ws.on("message", (message) => {
    logger.info(`Received message from client: ${message}`);
  });

  ws.on("close", (code, reason) => {
    logger.info(`Client disconnected; code: ${code}, reason: ${reason}`);
    logEmitter.removeListener("newLog", logListener);
  });

  ws.on("error", (error) => {
    logger.error(`WebSocket error: ${error.message}`);
    logEmitter.removeListener("newLog", logListener);
  });
});

let rpcport;
let network;

(async () => {
  try {
    await initializeRPCConnection();
    const rpcSettings = await getLocalRPCSettings();
    rpcport = rpcSettings.rpcport;
    network = getNetworkInfo(rpcport).network;

    async function configureRPCAndSetBurnAddress() {
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

    // Can't convert to client browser
    app.get("/", (req, res) => {
      res.sendFile(path.join(__dirname, "index.html"));
    });

    // Can't convert to client browser
    app.get("/favicon.ico", (req, res) => {
      res.sendFile(path.join(__dirname, "favicon.ico"));
    });

    const getNetworkInfo = async () => {
      try {
        const rpcSettings = await getLocalRPCSettings();
        rpcport = rpcSettings.rpcport;
        const network = getNetworkInfo(rpcport).network;
        return { success: true, network }
      } catch (error) {
        console.error("Error getting network info:", error);
        return { success: false, message: "Failed to get network info" }
      }
    }

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

    const getInferenceModelMenu = async () => {
      try {
        const pastelData = await getCurrentPastelIdAndPassphrase();
        const MY_LOCAL_PASTELID = pastelData.pastelID;
        const MY_PASTELID_PASSPHRASE = pastelData.passphrase;
        if (!MY_LOCAL_PASTELID || !MY_PASTELID_PASSPHRASE) {
          return {
            success: false,
            message: "Pastel ID and passphrase not set.",
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

    const getReceivedMessages = async () => {
      try {
        const messageDict = await checkForNewIncomingMessages();
        return { success: true, messageDict };
      } catch (error) {
        return { success: false, error: error.message };
      }
    }

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

    const getCreditPackInfo = async ({ txid }) => {
      try {
        const result = await getCreditPackTicketInfoEndToEnd(txid);
        return { success: true, result };
      } catch (error) {
        return { success: false, error: error.message };
      }
    }

    const getMyValidCreditPacks = async () => {
      try {
        const result = await getMyValidCreditPackTicketsEndToEnd();
        return { success: true, result: result || [] };
      } catch (error) {
        return { success: false, error: error.message };
      }
    }

    const getMyPslAddressWithLargestBalance = async () => {
      try {
        const result = await getMyPslAddressWithLargestBalance();
        return { success: true, result };
      } catch (error) {
        return { success: false, error: error.message };
      }
    }

    const createInferenceRequest = async ({
      model_inference_type_string: modelInferenceTypeString,
      model_parameters_json_b64,
      model_input_data_json_b64,
      selectedCreditPackTicketId: creditPackTicketPastelTxid,
      maxCost: maximumInferenceCostInCredits,
      model_canonical_name: requestedModelCanonicalString,
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

    const checkSupernodeList = async () => {
      try {
        const { validMasternodeListFullDF } = await checkSupernodeList();
        return { success: true, result: { validMasternodeListFullDF } };
      } catch (error) {
        return { success: false, error: error.message };
      }
    }

    const registerPastelID = async ({ pastelid, passphrase, address }) => {
      try {
        const result = await registerPastelID(pastelid, passphrase, address);
        return { success: true, result };
      } catch (error) {
        return { success: false, error: error.message };
      }
    }

    const getListPastelIdTickets = async (filter, minheight) => {
      try {
        const result = await listPastelIDTickets(filter, minheight);
        console.log("Pastel ID Tickets:", result);
        return { success: true, result };
      } catch (error) {
        return { success: false, error: error.message };
      }
    }

    const findPastelIDTicket = async ({ key }) => {
      try {
        const result = await findPastelIDTicket(key);
        return { success: true, result };
      } catch (error) {
        return { success: false, error: error.message };
      }
    }

    const getPastelTicket = async ({ txid, decodeProperties }) => {
      try {
        const result = await getPastelTicket(txid, decodeProperties);
        return { success: true, result };
      } catch (error) {
        return { success: false, error: error.message };
      }
    }

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

    const findContractTicket = async ({ key }) => {
      try {
        const result = await findContractTicket(key);
        return { success: true, result };
      } catch (error) {
        return { success: false, error: error.message };
      }
    }

    const getContractTicket = async ({ txid, decodeProperties }) => {
      try {
        const result = await getContractTicket(txid, decodeProperties);
        return { success: true, result };
      } catch (error) {
        return { success: false, error: error.message };
      }
    }

    const importPrivKey = async ({ zcashPrivKey, label, rescan }) => {
      try {
        const result = await importPrivKey(zcashPrivKey, label, rescan);
        return { success: true, result };
      } catch (error) {
        return { success: false, error: error.message };
      }
    }

    const importWallet = async ({ filename }) => {
      try {
        const result = await importWallet(filename);
        return { success: true, result };
      } catch (error) {
        return { success: false, error: error.message };
      }
    }

    const getListAddressAmounts = async ({includeEmpty, isMineFilter}) => {
      try {
        const result = await listAddressAmounts(includeEmpty, isMineFilter);
        return { success: true, result };
      } catch (error) {
        return { success: false, error: error.message };
      }
    }

    const getBalance = async ({ account, minConf, includeWatchOnly }) => {
      try {
        const result = await getBalance(account, minConf, includeWatchOnly);
        return { success: true, result };
      } catch (error) {
        return { success: false, error: error.message };
      }
    }

    const getWalletInfo = async () => {
      try {
        const result = await getWalletInfo();
        return { success: true, result };
      } catch (error) {
        return { success: false, error: error.message };
      }
    }

    const createAndFundNewAddress = async ({ amount }) => {
      try {
        const result = await createAndFundNewPSLCreditTrackingAddress(amount);
        return { success: true, result };
      } catch (error) {
        return { success: false, error: error.message };
      }
    }

    const checkForPastelID = async ({ autoRegister }) => {
      try {
        const result = await checkForRegisteredPastelID(autoRegister);
        return { success: true, result };
      } catch (error) {
        return { success: false, error: error.message };
      }
    }

    const importPastelID = async ({ file }) => {
      try {
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

    const setPastelIDPassphrase = async ({ pastelID, passphrase }) => {
      try {
        await setPastelIdAndPassphrase(pastelID, passphrase);
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
    app.listen(port, () => {
      console.log(`Server running at http://localhost:${port}`);
    });
  } catch (error) {
    console.error("Error initializing server:", error);
    process.exit(1);
  }
})();

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
