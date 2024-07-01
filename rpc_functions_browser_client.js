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

async function getCurrentPastelIdAndPassphrase() {
  try {
    const pastelID = await localStorage.getItem("MY_LOCAL_PASTELID");
    const passphrase = await localStorage.getItem("MY_PASTELID_PASSPHRASE");
    console.log(`Retrieved PastelID: ${pastelID}, Passphrase: ${passphrase}`);
    return { pastelID: pastelID || "", passphrase: passphrase || "" };
  } catch (error) {
    console.error("Error retrieving PastelID and passphrase:", error);
    return { pastelID: "", passphrase: "" };
  }
}

async function getCreditPackTicketInfoEndToEnd(txid) {
  try {
    const { pastelID, passphrase } = await getCurrentPastelIdAndPassphrase();
    const inferenceClient = new PastelInferenceClient(pastelID, passphrase);
    const { validMasternodeListFullDF } = await checkSupernodeList();
    const { url: supernodeURL } = await getClosestSupernodeToPastelIDURL(
      pastelID,
      validMasternodeListFullDF
    );
    if (!supernodeURL) {
      throw new Error("Supernode URL is undefined");
    }
    logger.info(
      `Getting credit pack ticket data from Supernode URL: ${supernodeURL}...`
    );

    const {
      creditPackPurchaseRequestResponse,
      creditPackPurchaseRequestConfirmation,
    } = await inferenceClient.getCreditPackTicketFromTxid(
      supernodeURL,
      creditPackTicketPastelTxid
    );

    const balanceInfo = await inferenceClient.checkCreditPackBalance(
      supernodeURL,
      creditPackTicketPastelTxid
    );

    return {
      success: true,
      result: {
        requestResponse: creditPackPurchaseRequestResponse,
        requestConfirmation: creditPackPurchaseRequestConfirmation,
        balanceInfo,
      }
    }
  } catch (error) {
    logger.error(`Error in getCreditPackTicketInfoEndToEnd: ${error.message}`);
    throw error;
  }
}