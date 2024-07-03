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

async function setPastelIdAndPassphrase(pastelID, passphrase) {
  try {
    await localStorage.setItem("MY_LOCAL_PASTELID", pastelID);
    await localStorage.setItem("MY_PASTELID_PASSPHRASE", passphrase);
    console.log(`Set PastelID: ${pastelID}, Passphrase: ${passphrase}`);
    return {
      success: true
    }
  } catch (error) {
    console.error("Error setting PastelID and passphrase:", error);
    throw error;
  }
}
