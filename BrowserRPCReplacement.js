// rpc_functions_browser_client.js

class BrowserRPCReplacement {
  constructor(apiBaseUrl = "https://opennode-fastapi.pastel.network") {
    this.apiBaseUrl = apiBaseUrl;
    this.pastelInstance = null;
    this.isInitialized = false;
  }

  async initialize() {
    if (!this.isInitialized) {
      if (
        typeof Module === "undefined" ||
        typeof Module.Pastel === "undefined"
      ) {
        throw new Error("WASM module not loaded");
      }
      this.pastelInstance = new Module.Pastel();
      this.isInitialized = true;
    }
  }

  async ensureInitialized() {
    if (!this.isInitialized) {
      await this.initialize();
    }
  }

  // Helper methods

  getNetworkMode(mode) {
    const modeMap = {
      Mainnet: Module.NetworkMode.Mainnet,
      Testnet: Module.NetworkMode.Testnet,
      Devnet: Module.NetworkMode.Devnet,
    };
    return modeMap[mode] || Module.NetworkMode.Mainnet;
  }

  executeWasmMethod(method) {
    try {
      const result = method();
      return this.parseWasmResponse(result);
    } catch (error) {
      console.error("WASM method execution failed:", error);
      throw new Error("WASM method execution failed: " + error.message);
    }
  }

  parseWasmResponse(response) {
    try {
      const parsedResponse = JSON.parse(response);
      if (parsedResponse.result) {
        return parsedResponse.data;
      } else {
        throw new Error(
          parsedResponse.error || "Unknown error in WASM response"
        );
      }
    } catch (error) {
      console.error("Error parsing WASM response:", error);
      throw new Error("Error parsing WASM response: " + error.message);
    }
  }

  async fetchJson(endpoint) {
    try {
      const response = await fetch(this.apiBaseUrl + endpoint);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error(`Error fetching from ${endpoint}:`, error);
      throw error;
    }
  }

  // RPC replacement functions

  // Removed getLocalRPCSettings as it's not applicable in a browser context

  async checkMasternodeTop() {
    return this.fetchJson("/masternode/top");
  }

  async getCurrentPastelBlockHeight() {
    return this.fetchJson("/getblockcount");
  }

  async getBestBlockHashAndMerkleRoot() {
    const blockHeight = await this.getCurrentPastelBlockHeight();
    const blockHash = await this.getBlockHash(blockHeight);
    const block = await this.getBlock(blockHash);
    return [blockHash, block.merkleroot, blockHeight];
  }

  async verifyMessageWithPastelID(
    pastelid,
    messageToVerify,
    pastelIDSignatureOnMessage
  ) {
    await this.ensureInitialized();
    return this.executeWasmMethod(() =>
      this.pastelInstance.VerifyWithPastelID(
        pastelid,
        messageToVerify,
        pastelIDSignatureOnMessage,
        "Mainnet"
      )
    );
  }

  async sendToAddress(address, amount, comment = "") {
    await this.ensureInitialized();
    const sendTo = [{ address, amount }];
    const fromAddress = await this.getMyPslAddressWithLargestBalance();
    return this.createSendToTransaction(sendTo, fromAddress);
  }

  async sendMany(amounts, minConf = 1, comment = "", changeAddress = "") {
    await this.ensureInitialized();
    const fromAddress = await this.getMyPslAddressWithLargestBalance();
    return this.createSendToTransaction(amounts, fromAddress);
  }

  async checkPSLAddressBalance(addressToCheck) {
    return this.fetchJson(`/get_address_balance?addresses=${addressToCheck}`);
  }

  async checkIfAddressIsAlreadyImportedInLocalWallet(addressToCheck) {
    await this.ensureInitialized();
    const addresses = await this.getAllAddresses();
    return addresses.includes(addressToCheck);
  }

  async getAndDecodeRawTransaction(txid, blockhash = null) {
    const rawTx = await this.fetchJson(`/getrawtransaction/${txid}`);
    return this.fetchJson(`/decoderawtransaction/${rawTx}`);
  }

  async getTransactionDetails(txid, includeWatchonly = false) {
    return this.fetchJson(
      `/gettransaction/${txid}?includeWatchonly=${includeWatchonly}`
    );
  }

  async sendTrackingAmountFromControlAddressToBurnAddressToConfirmInferenceRequest(
    inferenceRequestId,
    creditUsageTrackingPSLAddress,
    creditUsageTrackingAmountInPSL,
    burnAddress
  ) {
    const sendTo = [
      { address: burnAddress, amount: creditUsageTrackingAmountInPSL },
    ];
    const txid = await this.createSendToTransaction(
      sendTo,
      creditUsageTrackingPSLAddress
    );
    return txid;
  }

  async importAddress(address, label = "", rescan = false) {
    await this.ensureInitialized();
    // In a browser context, we can't directly import addresses.
    // Instead, we'll store the address in localStorage for tracking.
    const importedAddresses = JSON.parse(
      localStorage.getItem("importedAddresses") || "[]"
    );
    if (!importedAddresses.includes(address)) {
      importedAddresses.push(address);
      localStorage.setItem(
        "importedAddresses",
        JSON.stringify(importedAddresses)
      );
    }
    console.log(`Address ${address} has been tracked for monitoring.`);
  }

  async getBlockHash(blockHeight) {
    return this.fetchJson(`/getblockhash/${blockHeight}`);
  }

  async getBlock(blockHash) {
    return this.fetchJson(`/getblock/${blockHash}`);
  }

  async signMessageWithPastelID(pastelid, messageToSign) {
    await this.ensureInitialized();
    return this.executeWasmMethod(() =>
      this.pastelInstance.SignWithPastelID(
        pastelid,
        messageToSign,
        "PastelID",
        "Mainnet"
      )
    );
  }

  async createAndFundNewPSLCreditTrackingAddress(amountOfPSLToFundAddressWith) {
    await this.ensureInitialized();
    const newAddress = await this.makeNewAddress();
    const txid = await this.sendToAddress(
      newAddress,
      amountOfPSLToFundAddressWith,
      "Funding new credit tracking address"
    );
    return { newCreditTrackingAddress: newAddress, txid };
  }

  async checkSupernodeList() {
    return this.fetchJson("/supernode_data");
  }

  async createAndRegisterNewPastelID(passphraseForNewPastelID) {
    await this.ensureInitialized();
    const pastelID = await this.makeNewPastelID(true);
    const fundingAddress = await this.getMyPslAddressWithLargestBalance();
    const txid = await this.createRegisterPastelIdTransaction(
      pastelID,
      fundingAddress
    );
    return {
      success: true,
      PastelID: pastelID,
      PastelIDRegistrationTXID: txid,
    };
  }

  async getBalance(account = "*", minConf = 1, includeWatchOnly = false) {
    await this.ensureInitialized();
    const addresses = await this.getAllAddresses();
    let totalBalance = 0;
    for (const address of addresses) {
      const balance = await this.checkPSLAddressBalance(address);
      totalBalance += balance;
    }
    return totalBalance;
  }

  async getWalletInfo() {
    await this.ensureInitialized();
    const balance = await this.getBalance();
    const unconfirmedBalance = 0; // We might need to calculate this separately
    const immatureBalance = 0; // We might need to calculate this separately
    return {
      walletversion: 1,
      balance,
      unconfirmed_balance: unconfirmedBalance,
      immature_balance: immatureBalance,
      txcount: await this.getWalletTransactionCount(),
      keypoololdest: 0, // Not applicable in this context
      keypoolsize: 0, // Not applicable in this context
      paytxfee: 0.001, // This should be configurable
      seedfp: "Not available", // Not applicable in this context
    };
  }

  async getNewAddress() {
    await this.ensureInitialized();
    return this.makeNewAddress();
  }

  async getMyPslAddressWithLargestBalance() {
    await this.ensureInitialized();
    const addresses = await this.getAllAddresses();
    let maxBalance = -1;
    let addressWithMaxBalance = null;
    for (const address of addresses) {
      const balance = await this.checkPSLAddressBalance(address);
      if (balance > maxBalance) {
        maxBalance = balance;
        addressWithMaxBalance = address;
      }
    }
    return addressWithMaxBalance;
  }

  // Additional helper methods

  async getAllAddresses(mode = "Mainnet") {
    await this.ensureInitialized();
    const addressCount = await this.getAddressesCount();
    const addresses = [];
    for (let i = 0; i < addressCount; i++) {
      addresses.push(await this.getAddress(i, mode));
    }
    return addresses;
  }

  async getWalletTransactionCount() {
    // In a browser context, we need to keep track of transactions ourselves
    const transactions = JSON.parse(
      localStorage.getItem("transactions") || "[]"
    );
    return transactions.length;
  }

  // WASM wallet methods

  async createNewWallet(password) {
    await this.ensureInitialized();
    return this.executeWasmMethod(() =>
      this.pastelInstance.CreateNewWallet(password)
    );
  }

  async importWallet(serializedWallet) {
    await this.ensureInitialized();
    return this.executeWasmMethod(() =>
      this.pastelInstance.ImportWallet(serializedWallet)
    );
  }

  async exportWallet() {
    await this.ensureInitialized();
    return this.executeWasmMethod(() => this.pastelInstance.ExportWallet());
  }

  async makeNewAddress(mode = "Mainnet") {
    await this.ensureInitialized();
    return this.executeWasmMethod(() =>
      this.pastelInstance.MakeNewAddress(this.getNetworkMode(mode))
    );
  }

  async getAddress(index, mode = "Mainnet") {
    await this.ensureInitialized();
    return this.executeWasmMethod(() =>
      this.pastelInstance.GetAddress(index, this.getNetworkMode(mode))
    );
  }

  async getAddressesCount() {
    await this.ensureInitialized();
    return this.executeWasmMethod(() =>
      this.pastelInstance.GetAddressesCount()
    );
  }

  async makeNewPastelID(makeFullPair = false) {
    await this.ensureInitialized();
    return this.executeWasmMethod(() =>
      this.pastelInstance.MakeNewPastelID(makeFullPair)
    );
  }

  async getPastelIDByIndex(index, type = "PastelID") {
    await this.ensureInitialized();
    return this.executeWasmMethod(() =>
      this.pastelInstance.GetPastelIDByIndex(index, type)
    );
  }

  async getPastelIDsCount() {
    await this.ensureInitialized();
    return this.executeWasmMethod(() =>
      this.pastelInstance.GetPastelIDsCount()
    );
  }

  async createSendToTransaction(sendTo, fromAddress, mode = "Mainnet") {
    await this.ensureInitialized();
    const utxos = await this.getAddressUtxos(fromAddress);
    const blockHeight = await this.getCurrentPastelBlockHeight();
    const networkMode = this.getNetworkMode(mode);
    const sendToJson = JSON.stringify(sendTo);
    const utxosJson = JSON.stringify(utxos);

    return this.executeWasmMethod(() =>
      this.pastelInstance.CreateSendToTransaction(
        networkMode,
        sendToJson,
        fromAddress,
        utxosJson,
        blockHeight,
        0
      )
    );
  }

  async createRegisterPastelIdTransaction(
    pastelID,
    fundingAddress,
    mode = "Mainnet"
  ) {
    await this.ensureInitialized();
    const utxos = await this.getAddressUtxos(fundingAddress);
    const blockHeight = await this.getCurrentPastelBlockHeight();
    const networkMode = this.getNetworkMode(mode);
    const utxosJson = JSON.stringify(utxos);

    return this.executeWasmMethod(() =>
      this.pastelInstance.CreateRegisterPastelIdTransaction(
        networkMode,
        pastelID,
        fundingAddress,
        utxosJson,
        blockHeight,
        0
      )
    );
  }

  async signWithWalletKey(message) {
    await this.ensureInitialized();
    return this.executeWasmMethod(() =>
      this.pastelInstance.SignWithWalletKey(message)
    );
  }

  async unlockWallet(password) {
    await this.ensureInitialized();
    return this.executeWasmMethod(() =>
      this.pastelInstance.UnlockWallet(password)
    );
  }

  async lockWallet() {
    await this.ensureInitialized();
    return this.executeWasmMethod(() => this.pastelInstance.LockWallet());
  }

  async getWalletPubKey() {
    await this.ensureInitialized();
    return this.executeWasmMethod(() => this.pastelInstance.GetWalletPubKey());
  }

  // Additional API methods

  async getAddressUtxos(address) {
    return this.fetchJson(`/get_address_utxos?addresses=${address}`);
  }

  async listPastelIDTickets(filter = "mine", minheight = null) {
    let endpoint = `/tickets/id/list/${filter}`;
    if (minheight !== null) {
      endpoint += `/${minheight}`;
    }
    return this.fetchJson(endpoint);
  }

  async findPastelIDTicket(key) {
    return this.fetchJson(`/tickets/id/find/${key}`);
  }

  async getPastelTicket(txid, decodeProperties = true) {
    return this.fetchJson(
      `/tickets/get/${txid}?decode_properties=${decodeProperties}`
    );
  }

  async listContractTickets(ticketTypeIdentifier, startingBlockHeight = 0) {
    return this.fetchJson(
      `/tickets/contract/list/${ticketTypeIdentifier}/${startingBlockHeight}`
    );
  }

  async findContractTicket(key) {
    return this.fetchJson(`/tickets/contract/find/${key}`);
  }

  async getContractTicket(txid, decodeProperties = true) {
    return this.fetchJson(
      `/tickets/contract/get/${txid}?decode_properties=${decodeProperties}`
    );
  }

  async isPastelIDRegistered(pastelID) {
    return this.fetchJson(`/tickets/id/is_registered/${pastelID}`);
  }

  async dumpPrivKey(tAddr) {
    await this.ensureInitialized();
    // This is a sensitive operation that should be handled carefully in a browser environment
    console.warn(
      "dumpPrivKey called in browser context. This operation may expose sensitive information."
    );
    return this.executeWasmMethod(() => this.pastelInstance.DumpPrivKey(tAddr));
  }

  async importPrivKey(privKey, label = "", rescan = true) {
    await this.ensureInitialized();
    // This is a sensitive operation that should be handled carefully in a browser environment
    console.warn(
      "importPrivKey called in browser context. This operation may expose sensitive information."
    );
    return this.executeWasmMethod(() =>
      this.pastelInstance.ImportPrivKey(privKey, label, rescan)
    );
  }

  async listAddressAmounts(includeEmpty = false, isMineFilter = "all") {
    await this.ensureInitialized();
    const addresses = await this.getAllAddresses();
    const result = {};
    for (const address of addresses) {
      const balance = await this.checkPSLAddressBalance(address);
      if (includeEmpty || balance > 0) {
        result[address] = balance;
      }
    }
    return result;
  }

  async checkForRegisteredPastelID() {
    await this.ensureInitialized();
    const pastelIDs = await this.getAllPastelIDs();
    for (const pastelID of pastelIDs) {
      const isRegistered = await this.isPastelIDRegistered(pastelID);
      if (isRegistered) {
        return pastelID;
      }
    }
    return null;
  }

  async getAllPastelIDs() {
    await this.ensureInitialized();
    const count = await this.getPastelIDsCount();
    const pastelIDs = [];
    for (let i = 0; i < count; i++) {
      pastelIDs.push(await this.getPastelIDByIndex(i));
    }
    return pastelIDs;
  }

  getNetworkInfo(rpcport) {
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

  // This function doesn't make sense in a browser context, but we'll keep a placeholder
  getPastelIDDirectory(network) {
    console.warn(
      "getPastelIDDirectory called in browser context. This operation is not applicable."
    );
    return null;
  }

  // This function doesn't make sense in a browser context, but we'll keep a placeholder
  async getPastelIDsFromDirectory(directory) {
    console.warn(
      "getPastelIDsFromDirectory called in browser context. This operation is not applicable."
    );
    return [];
  }

  // This function doesn't make sense in a browser context, but we'll keep a placeholder
  async promptUserConfirmation(message) {
    console.warn(
      "promptUserConfirmation called in browser context. This operation should be handled by the UI."
    );
    return false;
  }

  async createAndRegisterPastelID(burnAddress) {
    await this.ensureInitialized();
    const pastelID = await this.makeNewPastelID(true);
    const fundingAddress = await this.getMyPslAddressWithLargestBalance();
    const txid = await this.createRegisterPastelIdTransaction(
      pastelID,
      fundingAddress
    );
    return { pastelID, txid };
  }

  async isCreditPackConfirmed(txid) {
    const ticket = await this.getPastelTicket(txid);
    return ticket && ticket.height > 0;
  }

  async ensureTrackingAddressesHaveMinimalPSLBalance(addressesList = null) {
    await this.ensureInitialized();
    const addresses = addressesList || (await this.getAllAddresses());
    const fundingAddress = await this.getMyPslAddressWithLargestBalance();

    for (const address of addresses) {
      const balance = await this.checkPSLAddressBalance(address);
      if (balance < 1.0) {
        const amountNeeded = Math.round((1.0 - balance) * 10000) / 10000;
        if (amountNeeded > 0.0001) {
          await this.sendToAddress(
            address,
            amountNeeded,
            "Balancing PSL amount"
          );
        }
      }
    }
  }

  // Utility functions

  formatNumberWithCommas(number) {
    return new Intl.NumberFormat("en-US").format(number);
  }

  // Additional methods that might be needed

  async getAddressHistory(address) {
    return this.fetchJson(`/get_address_history/${address}`);
  }

  async getBestBlockHash() {
    return this.fetchJson("/getbestblockhash");
  }

  async getMempoolInfo() {
    return this.fetchJson("/getmempoolinfo");
  }

  async getRawMempool() {
    return this.fetchJson("/getrawmempool");
  }

  async estimateFee(nblocks) {
    return this.fetchJson(`/estimatefee/${nblocks}`);
  }

  async validateAddress(address) {
    return this.fetchJson(`/validateaddress/${address}`);
  }

  async stopPastelDaemon() {
    console.warn("stopPastelDaemon is not applicable in a browser environment");
    throw new Error("Operation not supported in browser");
  }

  async startPastelDaemon() {
    console.warn(
      "startPastelDaemon is not applicable in a browser environment"
    );
    throw new Error("Operation not supported in browser");
  }

  async waitForRPCConnection(maxRetries = 5, interval = 1000) {
    // In a browser context, we assume the connection is always available
    return true;
  }

  async initializeRPCConnection() {
    // In a browser context, this is handled by the class constructor
    await this.initialize();
  }

  async getBlockchainInfo() {
    return this.fetchJson("/getblockchaininfo");
  }

  async getTxOutSetInfo() {
    return this.fetchJson("/gettxoutsetinfo");
  }

  async getChainTips() {
    return this.fetchJson("/getchaintips");
  }

  async getDifficulty() {
    return this.fetchJson("/getdifficulty");
  }

  async getBlockHeader(blockhash) {
    return this.fetchJson(`/getblockheader/${blockhash}`);
  }

  async getTxOut(txid, vout_value, includemempool = true) {
    return this.fetchJson(
      `/gettxout/${txid}/${vout_value}?includemempool=${includemempool}`
    );
  }

  async getTxOutProof(txid) {
    return this.fetchJson(`/gettxoutproof/${txid}`);
  }

  async verifyTxOutProof(proof) {
    return this.fetchJson(`/verifytxoutproof/${proof}`);
  }

  async getInfo() {
    return this.fetchJson("/getinfo");
  }

  async getMemoryInfo() {
    return this.fetchJson("/getmemoryinfo");
  }

  async getBlockSubsidy(height) {
    return this.fetchJson(`/getblocksubsidy/${height}`);
  }

  async getBlockTemplate() {
    return this.fetchJson("/getblocktemplate");
  }

  async getMiningInfo() {
    return this.fetchJson("/getmininginfo");
  }

  async getNextBlockSubsidy() {
    return this.fetchJson("/getnextblocksubsidy");
  }

  async getNetworkSolPs(blocks, height) {
    return this.fetchJson(`/getnetworksolps/${blocks}/${height}`);
  }

  async getAddedNodeInfo() {
    return this.fetchJson("/getaddednodeinfo");
  }

  async getPeerInfo() {
    return this.fetchJson("/getpeerinfo");
  }

  async decodeRawTransaction(hexstring) {
    return this.fetchJson(`/decoderawtransaction/${hexstring}`);
  }

  async decodeScript(hexstring) {
    return this.fetchJson(`/decodescript/${hexstring}`);
  }

  async validateAddress(transparentAddress) {
    return this.fetchJson(`/validateaddress/${transparentAddress}`);
  }

  async zValidateAddress(shieldedAddress) {
    return this.fetchJson(`/z_validateaddress/${shieldedAddress}`);
  }

  async listPastelIDTicketsOld(filter = "mine", minheight = null) {
    let endpoint = `/list_pastelid_tickets/${filter}`;
    if (minheight !== null) {
      endpoint += `/${minheight}`;
    }
    return this.fetchJson(endpoint);
  }

  async findPastelIDTicket(key) {
    return this.fetchJson(`/find_pastelid_ticket/${key}`);
  }

  async registerPastelID(pastelid, passphrase, address) {
    await this.ensureInitialized();
    // This operation involves signing, so we'll use the WASM library
    return this.executeWasmMethod(() =>
      this.pastelInstance.RegisterPastelID(pastelid, passphrase, address)
    );
  }

  async checkPSLAddressBalanceAlternative(addressToCheck) {
    const addressAmounts = await this.listAddressAmounts();
    return addressAmounts[addressToCheck] || 0;
  }

  async createNewWallet(password) {
    await this.ensureInitialized();
    return this.executeWasmMethod(() =>
      this.pastelInstance.CreateNewWallet(password)
    );
  }

  async createWalletFromMnemonic(password, mnemonic) {
    await this.ensureInitialized();
    return this.executeWasmMethod(() =>
      this.pastelInstance.CreateWalletFromMnemonic(password, mnemonic)
    );
  }

  async loadWallet(serializedWallet, password) {
    await this.ensureInitialized();
    await this.importWallet(serializedWallet);
    if (password) {
      await this.unlockWallet(password);
    }
    return true;
  }

  async downloadWallet(filename = "pastel_wallet.dat") {
    await this.ensureInitialized();
    const content = await this.exportWallet();
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.style.display = "none";
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    return true;
  }

  // Helper method to simulate file selection in a browser environment
  async selectAndReadWalletFile() {
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.onchange = (e) => {
        const file = e.target.files[0];
        const reader = new FileReader();
        reader.readAsText(file, "UTF-8");
        reader.onload = (readerEvent) => {
          const content = readerEvent.target.result;
          resolve(content);
        };
      };
      input.click();
    });
  }

  // Methods related to IndexedDB operations
  // Note: These methods would require a separate IndexedDBManager class implementation

  async saveWalletToIndexedDB(id, serializedWallet) {
    console.warn(
      "saveWalletToIndexedDB is not implemented in this class. Consider using a separate IndexedDB manager."
    );
  }

  async loadWalletFromIndexedDB(id) {
    console.warn(
      "loadWalletFromIndexedDB is not implemented in this class. Consider using a separate IndexedDB manager."
    );
  }

  async deleteWalletFromIndexedDB(id) {
    console.warn(
      "deleteWalletFromIndexedDB is not implemented in this class. Consider using a separate IndexedDB manager."
    );
  }

  async replaceWalletInIndexedDB(id) {
    console.warn(
      "replaceWalletInIndexedDB is not implemented in this class. Consider using a separate IndexedDB manager."
    );
  }
}

export default BrowserRPCReplacement;
