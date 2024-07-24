const PASTEL_OPENNODE_API_URL = "https://opennode-fastapi.pastel.network";

let pastelInstance;
Module.onRuntimeInitialized = function () {
  pastelInstance = new Module.Pastel();
};

function parseWasmResponse(responseFn) {
  try {
    return responseFn();
  } catch (error) {
    console.error("WASM Error:", error);
    throw error;
  }
}

// Can't convert to client browser
async function searchBinaryRecursively(directory, binaryName) {
  try {
    const result = execSync(
      `sudo find ${directory} -type f -name ${binaryName} -size +7M`,
      { encoding: "utf-8" }
    );
    return result.trim().split("\n").filter(Boolean);
  } catch (error) {
    return [];
  }
}

// Can't convert to client browser
async function getMostRecentBinary(binaries) {
  const stats = await Promise.all(
    binaries.map(async (binary) => {
      const stat = await fs.promises.stat(binary);
      return { binary, mtime: stat.mtime };
    })
  );
  return stats.sort((a, b) => b.mtime - a.mtime)[0]?.binary;
}

// Can't convert to client browser
async function locatePasteldBinary() {
  await storage.init();
  let pasteldBinaryPath = await storage.getItem("pasteldBinaryPath");
  if (!pasteldBinaryPath || !fs.existsSync(pasteldBinaryPath)) {
    const searchDirectories = ["/home", "/usr/local/bin", "/usr/bin"];
    if (process.platform === "win32") {
      searchDirectories.push(process.env.ProgramFiles);
    } else if (process.platform === "darwin") {
      searchDirectories.push("/Users");
    } else {
      searchDirectories.push("/home", "/etc");
    }
    const foundBinaries = (
      await Promise.all(
        searchDirectories.map((dir) => searchBinaryRecursively(dir, "pasteld"))
      )
    ).flat();
    pasteldBinaryPath = await getMostRecentBinary(foundBinaries);
    if (!pasteldBinaryPath) {
      throw new Error("pasteld binary not found on the system.");
    }
    await storage.setItem("pasteldBinaryPath", pasteldBinaryPath);
  }
  return pasteldBinaryPath;
}

// Can't convert to client browser
async function startPastelDaemon() {
  try {
    const pasteldPath = await locatePasteldBinary();
    console.log(`Starting pasteld from path: ${pasteldPath}`);

    const pastelDaemon = spawn(pasteldPath, [], { stdio: "inherit" });

    pastelDaemon.on("close", (code) => {
      console.log(`pasteld process exited with code ${code}`);
    });

    pastelDaemon.on("error", (err) => {
      console.error("Error starting pasteld:", err);
    });
  } catch (error) {
    console.error("Failed to start pasteld:", error);
  }
}

// Can't convert to client browser
async function getMostRecentFile(files) {
  return files
    .map((file) => ({ file, mtime: fs.statSync(file).mtime }))
    .sort((a, b) => b.mtime - a.mtime)[0]?.file;
}

// Can't convert to client browser
function searchFileRecursively(directory, filename) {
  try {
    const result = execSync(`sudo find ${directory} -name ${filename}`, {
      encoding: "utf-8",
    });
    return result.trim().split("\n").filter(Boolean);
  } catch (error) {
    return [];
  }
}

// Can't convert to client browser
async function getLocalRPCSettings(
  directoryWithPastelConf = path.join(os.homedir(), ".pastel")
) {
  await storage.init();
  let pastelConfPath =
    (await storage.getItem("pastelConfPath")) ||
    path.join(directoryWithPastelConf, "pastel.conf");
  if (!fs.existsSync(pastelConfPath)) {
    console.log(
      `pastel.conf not found in stored path or default directory, scanning the system...`
    );
    const searchDirectories = ["/home"];
    if (process.platform === "win32") {
      searchDirectories.push(process.env.ProgramData);
    } else if (process.platform === "darwin") {
      searchDirectories.push("/Users");
    } else {
      searchDirectories.push("/home", "/etc");
    }
    const foundFiles = searchDirectories.flatMap((dir) =>
      searchFileRecursively(dir, "pastel.conf")
    );
    pastelConfPath = await getMostRecentFile(foundFiles);
    if (!pastelConfPath) {
      throw new Error("pastel.conf file not found on the system.");
    }
    await storage.setItem("pastelConfPath", pastelConfPath);
  }
  const lines = fs.readFileSync(pastelConfPath, "utf-8").split("\n");
  const otherFlags = {};
  let rpchost = "127.0.0.1";
  let rpcport = "19932";
  let rpcuser = "";
  let rpcpassword = "";
  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.startsWith("#")) {
      continue; // Ignore blank lines and comments
    }
    if (trimmedLine.includes("=")) {
      const [key, value] = trimmedLine.split("=", 2);
      const trimmedKey = key.trim();
      const trimmedValue = value.trim();

      if (trimmedKey === "rpcport") {
        rpcport = trimmedValue;
      } else if (trimmedKey === "rpcuser") {
        rpcuser = trimmedValue;
      } else if (trimmedKey === "rpcpassword") {
        rpcpassword = trimmedValue;
      } else if (trimmedKey === "rpchost") {
        rpchost = trimmedValue;
      } else {
        otherFlags[trimmedKey] = trimmedValue;
      }
    }
  }
  return { rpchost, rpcport, rpcuser, rpcpassword, otherFlags };
}

class JSONRPCException extends Error {
  constructor(rpcError) {
    super(rpcError.message);
    this.error = rpcError;
    this.code = rpcError.code || null;
    this.message = rpcError.message || null;
  }
  toString() {
    return `${this.code}: ${this.message}`;
  }
}

class Semaphore {
  constructor(maxConcurrent) {
    this.maxConcurrent = maxConcurrent;
    this.counter = maxConcurrent;
    this.waiting = [];
  }
  async acquire() {
    if (this.counter <= 0) {
      await new Promise((resolve) => this.waiting.push(resolve));
    }
    this.counter--;
  }
  release() {
    this.counter++;
    if (this.waiting.length > 0) {
      const resolve = this.waiting.shift();
      resolve();
    }
  }
}

class AsyncAuthServiceProxy {
  static maxConcurrentRequests = 5000;
  static semaphore = new Semaphore(AsyncAuthServiceProxy.maxConcurrentRequests);

  constructor(
    serviceUrl,
    serviceName = null,
    reconnectTimeout = 15,
    reconnectAmount = 2,
    requestTimeout = 20
  ) {
    this.serviceUrl = serviceUrl;
    this.serviceName = serviceName;
    this.url = new URL(serviceUrl);
    this.client = axios.create({
      timeout: requestTimeout * 1000,
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });
    this.idCount = 0;
    const { username, password } = this.url;
    const authPair = `${username}:${password}`;
    this.authHeader = `Basic ${Buffer.from(authPair).toString("base64")}`;
    this.reconnectTimeout = reconnectTimeout;
    this.reconnectAmount = reconnectAmount;
    this.requestTimeout = requestTimeout;
  }

  async call(methodName, ...args) {
    await AsyncAuthServiceProxy.semaphore.acquire();
    try {
      this.idCount += 1;
      const postData = JSON.stringify({
        jsonrpc: "2.0",
        method: methodName,
        params: args,
        id: this.idCount,
      });
      const headers = {
        Host: this.url.hostname,
        "User-Agent": "AuthServiceProxy/0.1",
        Authorization: this.authHeader,
        "Content-Type": "application/json",
      };

      let response;
      for (let i = 0; i < this.reconnectAmount; i++) {
        try {
          if (i > 0) {
            const sleepTime = this.reconnectTimeout * 2 ** i;
            logger.error(`Reconnect try #${i + 1}`);
            logger.info(`Waiting for ${sleepTime} seconds before retrying.`);
            await new Promise((resolve) =>
              setTimeout(resolve, sleepTime * 1000)
            );
          }
          response = await this.client.post(this.serviceUrl, postData, {
            headers,
          });
          break;
        } catch (error) {
          logger.error(`Error occurred on attempt ${i + 1}: ${error}`);
          if (i === this.reconnectAmount - 1) {
            logger.error("Reconnect tries exceeded.");
            throw error;
          }
        }
      }
      if (!response) {
        throw new Error("No response from server, all retry attempts failed.");
      }
      const responseJson = response.data;
      if (responseJson.error) {
        throw new JSONRPCException(responseJson.error);
      } else if (!("result" in responseJson)) {
        throw new JSONRPCException({
          code: -343,
          message: "Missing JSON-RPC result",
        });
      }
      return responseJson.result;
    } finally {
      AsyncAuthServiceProxy.semaphore.release();
    }
  }

  // Create a proxy to handle method calls dynamically
  static create(serviceUrl) {
    const handler = {
      get: function (target, propKey) {
        if (typeof target[propKey] === "function") {
          return function (...args) {
            return target[propKey](...args);
          };
        } else {
          return function (...args) {
            return target.call(propKey, ...args);
          };
        }
      },
    };
    return new Proxy(new AsyncAuthServiceProxy(serviceUrl), handler);
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

async function signMessageWithPastelID(pastelid, messageToSign, passphrase) {
  try {
    const signature = parseWasmResponse(() =>
      pastelInstance.pastelid(
        "sign",
        messageToSign,
        pastelid,
        passphrase,
        "ed448"
      )
    );
    return signature;
  } catch (error) {
    logger.error(`Error in signMessageWithPastelID: ${safeStringify(error)}`);
    return null;
  }
}

async function checkPSLAddressBalanceAlternative(addressToCheck) {
  try {
    const addressAmountsDict = await pastelInstance.listaddressamounts();
    // Convert the object into an array of objects, each representing a row
    const data = Object.entries(addressAmountsDict).map(
      ([address, amount]) => ({ address, amount })
    );
    // Filter the array for the specified address
    const filteredData = data.filter((item) => item.address === addressToCheck);
    // Calculate the sum of the 'amount' column for the filtered array
    const balanceAtAddress = filteredData.reduce(
      (acc, item) => acc + item.amount,
      0
    );
    return balanceAtAddress;
  } catch (error) {
    logger.error(
      `Error in checkPSLAddressBalanceAlternative: ${safeStringify(error)}`
    );
    throw error;
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
    return addresses[0];
  } catch (error) {
    logger.error(
      `Error in getMyPslAddressWithLargestBalance: ${safeStringify(error)}`
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

async function waitForTableCreation() {
  const maxRetries = 5;
  const retryDelay = 1000; // 1 second
  for (let i = 0; i < maxRetries; i++) {
    try {
      await db.find({
        selector: {}
      });
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

    const validationSchema = yup.array().items(supernodeListSchema);
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

async function registerPastelID(pastelid, passphrase, address) {
  try {
    const result = await pastelInstance.tickets(
      "register",
      "id",
      pastelid,
      passphrase,
      address
    );
    logger.info(`Registered PastelID: ${pastelid}. TXID: ${result}`);
    return result;
  } catch (error) {
    logger.error(
      `Error registering PastelID: ${pastelid}. Error:`,
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
    const result = await pastelInstance.tickets("find", "id", key);
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
    const result = await pastelInstance.tickets("get", txid, decodeProperties);
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

async function importPrivKey(privateKey) {
  try {
    parseWasmResponse(() => pastelInstance.ImportPrivateKey(privateKey));
    return true;
  } catch (error) {
    logger.error(`Error importing private key: ${safeStringify(error)}`);
    throw error;
  }
}

async function importWallet(filename) {
  try {
    parseWasmResponse(() => pastelInstance.importwallet(filename));
    return true;
  } catch (error) {
    logger.error(`Error in importWallet: ${safeStringify(error)}`);
    throw error;
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

async function getWalletInfo() {
  try {
    const result = parseWasmResponse(() => pastelInstance.getwalletinfo());
    logger.info("Got wallet info");
    return result;
  } catch (error) {
    logger.error(`Error getting wallet info: ${safeStringify(error)}`);
    throw error;
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

async function checkForRegisteredPastelID() {
  try {
    // *********************************
    // Need to replace with a call API
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

// Can't convert to client browser
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

// Can't convert to client browser
async function getPastelIDsFromDirectory(directory) {
  const files = await fs.promises.readdir(directory);
  const pastelIDs = files.filter((file) => file.length === 87);
  return pastelIDs;
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

// Can't convert to client browser
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
    const newPastelIDResult = await pastelInstance.pastelid("newkey");
    const newPastelID = newPastelIDResult.pastelid;
    const passphrase = newPastelIDResult.passphrase;
    const address = await pastelInstance.getnewaddress();
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
