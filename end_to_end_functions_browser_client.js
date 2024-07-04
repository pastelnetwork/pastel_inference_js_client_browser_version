const { v4: uuidv4 } = UUID;

async function getCreditPackTicketInfoEndToEnd(creditPackTicketPastelTxid) {
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
      requestResponse: creditPackPurchaseRequestResponse,
      requestConfirmation: creditPackPurchaseRequestConfirmation,
      balanceInfo,
    };
  } catch (error) {
    logger.error(`Error in getCreditPackTicketInfoEndToEnd: ${error.message}`);
    throw error;
  }
}

async function estimateCreditPackCostEndToEnd(
  desiredNumberOfCredits,
  creditPriceCushionPercentage
) {
  try {
    const { pastelID, passphrase } = await getCurrentPastelIdAndPassphrase();
    const inferenceClient = new PastelInferenceClient(pastelID, passphrase);
    const estimatedTotalCostOfTicket =
      await inferenceClient.internalEstimateOfCreditPackTicketCostInPSL(
        desiredNumberOfCredits,
        creditPriceCushionPercentage
      );
    return { success: true, result: estimatedTotalCostOfTicket } ;
  } catch (error) {
    logger.error(`Error in estimateCreditPackCostEndToEnd: ${error.message}`);
    throw error;
  }
}

function getIsoStringWithMicroseconds() {
  const now = new Date();
  const isoString = now.toISOString().replace("Z", "+00:00").replace(/\s/g, "");
  return isoString;
}

async function handleCreditPackTicketEndToEnd(
  numberOfCredits,
  creditUsageTrackingPSLAddress,
  burnAddress,
  maximumTotalCreditPackPriceInPSL,
  maximumPerCreditPriceInPSL
) {
  try {
    const { pastelID, passphrase } = await getCurrentPastelIdAndPassphrase();
    if (!pastelID || !passphrase) {
      throw new Error("PastelID or passphrase is not set");
    }

    const inferenceClient = new PastelInferenceClient(pastelID, passphrase);
    const { validMasternodeListFullDF } = await checkSupernodeList();
    const requestTimestamp = getIsoStringWithMicroseconds();

    const creditPackRequest = {
      id: uuidv4(),
      requesting_end_user_pastelid: pastelID,
      requested_initial_credits_in_credit_pack: parseInt(numberOfCredits, 10),
      list_of_authorized_pastelids_allowed_to_use_credit_pack: JSON.stringify([
        pastelID,
      ]),
      credit_usage_tracking_psl_address: creditUsageTrackingPSLAddress,
      request_timestamp_utc_iso_string: requestTimestamp,
      request_pastel_block_height: parseInt(
        await getCurrentPastelBlockHeight(),
        10
      ),
      credit_purchase_request_message_version_string: "1.0",
      sha3_256_hash_of_credit_pack_purchase_request_fields: "",
      requesting_end_user_pastelid_signature_on_request_hash: "",
    };

    creditPackRequest.sha3_256_hash_of_credit_pack_purchase_request_fields =
      await computeSHA3256HashOfSQLModelResponseFields(creditPackRequest);
    creditPackRequest.requesting_end_user_pastelid_signature_on_request_hash =
      await signMessageWithPastelID(
        pastelID,
        creditPackRequest.sha3_256_hash_of_credit_pack_purchase_request_fields,
        passphrase
      );

    const closestSupernodes = await getNClosestSupernodesToPastelIDURLs(
      1,
      pastelID,
      validMasternodeListFullDF
    );
    const highestRankedSupernodeURL = closestSupernodes[0].url;

    logger.info(
      "Closest supernode URL for credit pack request:",
      highestRankedSupernodeURL
    );


    const preliminaryPriceQuote =
      await inferenceClient.creditPackTicketInitialPurchaseRequest(
        highestRankedSupernodeURL,
        creditPackRequest
      );
    const signedCreditPackTicketOrRejection =
      await inferenceClient.creditPackTicketPreliminaryPriceQuoteResponse(
        highestRankedSupernodeURL,
        creditPackRequest,
        preliminaryPriceQuote,
        maximumTotalCreditPackPriceInPSL,
        maximumPerCreditPriceInPSL
      );

    if (
      signedCreditPackTicketOrRejection instanceof
      CreditPackPurchaseRequestResponseTermination
    ) {
      logger.error(
        `Credit pack purchase request terminated: ${signedCreditPackTicketOrRejection.termination_reason_string}`
      );
      return null;
    }

    const signedCreditPackTicket = signedCreditPackTicketOrRejection;

    const burnTransactionResponse = await sendToAddress(
      burnAddress,
      Math.round(
        signedCreditPackTicket.proposed_total_cost_of_credit_pack_in_psl *
          100000
      ) / 100000,
      "Burn transaction for credit pack ticket"
    );

    if (!burnTransactionResponse.success) {
      logger.error(
        `Error sending PSL to burn address for credit pack ticket: ${burnTransactionResponse.message}`
      );
      return null;
    }

    const burnTransactionTxid = burnTransactionResponse.result;

    const creditPackPurchaseRequestConfirmation =
      CreditPackPurchaseRequestConfirmation.build({
        sha3_256_hash_of_credit_pack_purchase_request_fields:
          creditPackRequest.sha3_256_hash_of_credit_pack_purchase_request_fields,
        sha3_256_hash_of_credit_pack_purchase_request_response_fields:
          signedCreditPackTicket.sha3_256_hash_of_credit_pack_purchase_request_response_fields,
        credit_pack_purchase_request_fields_json_b64:
          signedCreditPackTicket.credit_pack_purchase_request_fields_json_b64,
        requesting_end_user_pastelid: pastelID,
        txid_of_credit_purchase_burn_transaction: burnTransactionTxid,
        credit_purchase_request_confirmation_utc_iso_string:
          new Date().toISOString(),
        credit_purchase_request_confirmation_pastel_block_height:
          await getCurrentPastelBlockHeight(),
        credit_purchase_request_confirmation_message_version_string: "1.0",
        sha3_256_hash_of_credit_pack_purchase_request_confirmation_fields: "",
        requesting_end_user_pastelid_signature_on_sha3_256_hash_of_credit_pack_purchase_request_confirmation_fields:
          "",
      });

    creditPackPurchaseRequestConfirmation.sha3_256_hash_of_credit_pack_purchase_request_confirmation_fields =
      await computeSHA3256HashOfSQLModelResponseFields(
        creditPackPurchaseRequestConfirmation
      );
    creditPackPurchaseRequestConfirmation.requesting_end_user_pastelid_signature_on_sha3_256_hash_of_credit_pack_purchase_request_confirmation_fields =
      await signMessageWithPastelID(
        pastelID,
        creditPackPurchaseRequestConfirmation.sha3_256_hash_of_credit_pack_purchase_request_confirmation_fields,
        passphrase
      );

    const { error: confirmationValidationError } =
      creditPackPurchaseRequestConfirmationSchema.validate(
        creditPackPurchaseRequestConfirmation.toJSON()
      );
    if (confirmationValidationError) {
      throw new Error(
        `Invalid credit pack purchase request confirmation: ${confirmationValidationError.message}`
      );
    }

    await CreditPackPurchaseRequestConfirmation.create(
      creditPackPurchaseRequestConfirmation.toJSON()
    );

    const creditPackPurchaseRequestConfirmationResponse =
      await inferenceClient.confirmCreditPurchaseRequest(
        highestRankedSupernodeURL,
        creditPackPurchaseRequestConfirmation
      );

    if (!creditPackPurchaseRequestConfirmationResponse) {
      logger.error("Credit pack ticket storage failed!");
      return null;
    }

    for (const supernodePastelID of JSON.parse(
      signedCreditPackTicket.list_of_supernode_pastelids_agreeing_to_credit_pack_purchase_terms
    )) {
      try {
        if (checkIfPastelIDIsValid(supernodePastelID)) {
          const supernodeURL = await getSupernodeUrlFromPastelID(
            supernodePastelID,
            validMasternodeListFullDF
          );
          await inferenceClient.creditPackPurchaseCompletionAnnouncement(
            supernodeURL,
            creditPackPurchaseRequestConfirmation
          );
        }
      } catch (error) {
        logger.error(
          `Error getting Supernode URL for PastelID: ${supernodePastelID}: ${error.message}`
        );
      }
    }

    let creditPackPurchaseRequestStatus;
    for (let i = 0; i < closestSupernodes.length; i++) {
      try {
        const supernodeURL = closestSupernodes[i].url;
        creditPackPurchaseRequestStatus =
          await inferenceClient.checkStatusOfCreditPurchaseRequest(
            supernodeURL,
            creditPackRequest.sha3_256_hash_of_credit_pack_purchase_request_fields
          );
        logger.info(
          `Credit pack purchase request status: ${prettyJSON(
            creditPackPurchaseRequestStatus
          )}`
        );
        break;
      } catch (error) {
        logger.error(
          `Error checking status of credit purchase request with Supernode ${
            i + 1
          }: ${error.message}`
        );
        if (i === closestSupernodes.length - 1) {
          logger.error(
            "Failed to check status of credit purchase request with all Supernodes"
          );
          return null;
        }
      }
    }

    if (creditPackPurchaseRequestStatus.status !== "completed") {
      logger.error(
        `Credit pack purchase request failed: ${creditPackPurchaseRequestStatus.status}`
      );
      const closestAgreeingSupernodePastelID =
        await getClosestSupernodePastelIDFromList(
          pastelID,
          signedCreditPackTicket.list_of_supernode_pastelids_agreeing_to_credit_pack_purchase_terms
        );

      const creditPackStorageRetryRequest = CreditPackStorageRetryRequest.build(
        {
          sha3_256_hash_of_credit_pack_purchase_request_response_fields:
            signedCreditPackTicket.sha3_256_hash_of_credit_pack_purchase_request_response_fields,
          credit_pack_purchase_request_fields_json_b64:
            signedCreditPackTicket.credit_pack_purchase_request_fields_json_b64,
          requesting_end_user_pastelid: pastelID,
          closest_agreeing_supernode_to_retry_storage_pastelid:
            closestAgreeingSupernodePastelID,
          credit_pack_storage_retry_request_timestamp_utc_iso_string:
            new Date().toISOString(),
          credit_pack_storage_retry_request_pastel_block_height:
            await getCurrentPastelBlockHeight(),
          credit_pack_storage_retry_request_message_version_string: "1.0",
          sha3_256_hash_of_credit_pack_storage_retry_request_fields: "",
          requesting_end_user_pastelid_signature_on_credit_pack_storage_retry_request_hash:
            "",
        }
      );

      creditPackStorageRetryRequest.sha3_256_hash_of_credit_pack_storage_retry_request_fields =
        await computeSHA3256HashOfSQLModelResponseFields(
          creditPackStorageRetryRequest
        );
      creditPackStorageRetryRequest.requesting_end_user_pastelid_signature_on_credit_pack_storage_retry_request_hash =
        await signMessageWithPastelID(
          pastelID,
          creditPackStorageRetryRequest.sha3_256_hash_of_credit_pack_storage_retry_request_fields,
          passphrase
        );

      const { error: storageRetryRequestValidationError } =
        creditPackStorageRetryRequestSchema.validate(
          creditPackStorageRetryRequest.toJSON()
        );
      if (storageRetryRequestValidationError) {
        throw new Error(
          `Invalid credit pack storage retry request: ${storageRetryRequestValidationError.message}`
        );
      }

      await CreditPackStorageRetryRequest.create(
        creditPackStorageRetryRequest.toJSON()
      );
      const closestAgreeingSupernodeURL = await getSupernodeUrlFromPastelID(
        closestAgreeingSupernodePastelID,
        validMasternodeListFullDF
      );
      const creditPackStorageRetryRequestResponse =
        await inferenceClient.creditPackStorageRetryRequest(
          closestAgreeingSupernodeURL,
          creditPackStorageRetryRequest
        );

      const { error: storageRetryResponseValidationError } =
        creditPackStorageRetryRequestResponseSchema.validate(
          creditPackStorageRetryRequestResponse.toJSON()
        );
      if (storageRetryResponseValidationError) {
        throw new Error(
          `Invalid credit pack storage retry request response: ${storageRetryResponseValidationError.message}`
        );
      }

      for (const supernodePastelID of signedCreditPackTicket.list_of_supernode_pastelids_agreeing_to_credit_pack_purchase_terms) {
        try {
          if (checkIfPastelIDIsValid(supernodePastelID)) {
            const supernodeURL = await getSupernodeUrlFromPastelID(
              supernodePastelID,
              validMasternodeListFullDF
            );
            await inferenceClient.creditPackPurchaseCompletionAnnouncement(
              supernodeURL,
              creditPackStorageRetryRequestResponse
            );
          }
        } catch (error) {
          logger.error(
            `Error sending credit_pack_purchase_completion_announcement to Supernode URL: ${supernodeURL}: ${error.message}`
          );
        }
      }

      return creditPackStorageRetryRequestResponse;
    } else {
      return creditPackPurchaseRequestConfirmationResponse;
    }
  } catch (error) {
    logger.error(`Error in handleCreditPackTicketEndToEnd: ${error.message}`);
    throw error;
  }
}

async function checkForNewIncomingMessages() {
  try {
    const { pastelID, passphrase } = await getCurrentPastelIdAndPassphrase();
    const inferenceClient = new PastelInferenceClient(pastelID, passphrase);

    if (!pastelID || !passphrase) {
      logger.error("PastelID or passphrase is not set");
      return [];
    }
    const { validMasternodeListFullDF } = await checkSupernodeList();

    logger.info("Retrieving incoming user messages...");
    logger.info(`My local pastelid: ${inferenceClient.pastelID}`);

    const closestSupernodesToLocal = await getNClosestSupernodesToPastelIDURLs(
      3,
      inferenceClient.pastelID,
      validMasternodeListFullDF
    );
    logger.info(
      `Closest Supernodes to local pastelid: ${closestSupernodesToLocal
        .map((sn) => `PastelID: ${sn.pastelID}, URL: ${sn.url}`)
        .join(", ")}`
    );

    const messageRetrievalTasks = closestSupernodesToLocal.map(({ url }) =>
      inferenceClient.getUserMessages(url).catch((error) => {
        logger.warn(
          `Failed to retrieve messages from supernode ${url}: ${error.message}`
        );
        return []; // Return an empty array on error
      })
    );
    const messageLists = await Promise.all(messageRetrievalTasks);

    const uniqueMessages = [];
    const messageIDs = new Set();
    for (const messageList of messageLists) {
      for (const message of messageList) {
        if (!messageIDs.has(message.id)) {
          uniqueMessages.push(message);
          messageIDs.add(message.id);
        }
      }
    }

    logger.info(
      `Retrieved unique user messages: ${safeStringify(uniqueMessages)}`
    );

    return uniqueMessages;
  } catch (error) {
    logger.error(`Error in checkForNewIncomingMessages: ${error.message}`);
    throw error;
  }
}