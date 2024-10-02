// browser_validation_schemas.js

import * as Yup from 'yup';

// Helper function to create a UUID validator
const uuidv4 = () => 
  Yup.string().matches(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);

export const supernodeListSchema = Yup.object({
  txid_vout: Yup.string().required(),
  supernode_status: Yup.string().required(),
  protocol_version: Yup.number().required(),
  supernode_psl_address: Yup.string().required(),
  lastseentime: Yup.number().required(),
  activeseconds: Yup.number().required(),
  activedays: Yup.number().required(),
  lastpaidtime: Yup.number().required(),
  lastpaidblock: Yup.number().required(),
  ipaddress_port: Yup.string().required(),
  rank: Yup.number().required(),
  pubkey: Yup.string().required(),
  extAddress: Yup.string().required(),
  extP2P: Yup.string().required(),
  extKey: Yup.string().required(),
});

export const messageSchema = Yup.object({
  id: uuidv4().required(),
  sending_sn_pastelid: Yup.string().required(),
  receiving_sn_pastelid: Yup.string().required(),
  sending_sn_txid_vout: Yup.string().required(),
  receiving_sn_txid_vout: Yup.string().required(),
  message_type: Yup.string().required(),
  message_body: Yup.string().required(),
  signature: Yup.string().required(),
  timestamp: Yup.date().iso(),
});

export const userMessageSchema = Yup.object({
  id: uuidv4().required(),
  from_pastelid: Yup.string().required(),
  to_pastelid: Yup.string().required(),
  message_body: Yup.string().required(),
  message_signature: Yup.string().required(),
  timestamp: Yup.date().iso(),
});

export const creditPackPurchaseRequestSchema = Yup.object({
  id: uuidv4().required(),
  requesting_end_user_pastelid: Yup.string().required(),
  requested_initial_credits_in_credit_pack: Yup.number().integer().required(),
  list_of_authorized_pastelids_allowed_to_use_credit_pack: Yup.string().required(),
  credit_usage_tracking_psl_address: Yup.string().required(),
  request_timestamp_utc_iso_string: Yup.string().required(),
  request_pastel_block_height: Yup.number().integer().required(),
  credit_purchase_request_message_version_string: Yup.string().required(),
  sha3_256_hash_of_credit_pack_purchase_request_fields: Yup.string().required(),
  requesting_end_user_pastelid_signature_on_request_hash: Yup.string().required(),
});

export const creditPackPurchaseRequestRejectionSchema = Yup.object({
  sha3_256_hash_of_credit_pack_purchase_request_fields: Yup.string().required(),
  credit_pack_purchase_request_fields_json_b64: Yup.string().required(),
  rejection_reason_string: Yup.string().required(),
  rejection_timestamp_utc_iso_string: Yup.string().required(),
  rejection_pastel_block_height: Yup.number().integer().required(),
  credit_purchase_request_rejection_message_version_string: Yup.string().required(),
  responding_supernode_pastelid: Yup.string().required(),
  sha3_256_hash_of_credit_pack_purchase_request_rejection_fields: Yup.string().required(),
  responding_supernode_signature_on_credit_pack_purchase_request_rejection_hash: Yup.string().required(),
});

export const creditPackPurchaseRequestPreliminaryPriceQuoteSchema = Yup.object({
  sha3_256_hash_of_credit_pack_purchase_request_fields: Yup.string().required(),
  credit_usage_tracking_psl_address: Yup.string().required(),
  credit_pack_purchase_request_fields_json_b64: Yup.string().required(),
  preliminary_quoted_price_per_credit_in_psl: Yup.number().required(),
  preliminary_total_cost_of_credit_pack_in_psl: Yup.number().required(),
  preliminary_price_quote_timestamp_utc_iso_string: Yup.string().required(),
  preliminary_price_quote_pastel_block_height: Yup.number().integer().required(),
  preliminary_price_quote_message_version_string: Yup.string().required(),
  responding_supernode_pastelid: Yup.string().required(),
  sha3_256_hash_of_credit_pack_purchase_request_preliminary_price_quote_fields: Yup.string().required(),
  responding_supernode_signature_on_credit_pack_purchase_request_preliminary_price_quote_hash: Yup.string().required(),
});

export const creditPackPurchaseRequestPreliminaryPriceQuoteResponseSchema = Yup.object({
  id: uuidv4().required(),
  sha3_256_hash_of_credit_pack_purchase_request_fields: Yup.string().required(),
  sha3_256_hash_of_credit_pack_purchase_request_preliminary_price_quote_fields: Yup.string().required(),
  credit_pack_purchase_request_fields_json_b64: Yup.string().required(),
  agree_with_preliminary_price_quote: Yup.boolean().required(),
  credit_usage_tracking_psl_address: Yup.string().required(),
  preliminary_quoted_price_per_credit_in_psl: Yup.number().required(),
  preliminary_price_quote_response_timestamp_utc_iso_string: Yup.string().required(),
  preliminary_price_quote_response_pastel_block_height: Yup.number().integer().required(),
  preliminary_price_quote_response_message_version_string: Yup.string().required(),
  requesting_end_user_pastelid: Yup.string().required(),
  sha3_256_hash_of_credit_pack_purchase_request_preliminary_price_quote_response_fields: Yup.string().required(),
  requesting_end_user_pastelid_signature_on_preliminary_price_quote_response_hash: Yup.string().required(),
});

export const creditPackPurchaseRequestResponseTerminationSchema = Yup.object({
  sha3_256_hash_of_credit_pack_purchase_request_fields: Yup.string().required(),
  credit_pack_purchase_request_fields_json_b64: Yup.string().required(),
  termination_reason_string: Yup.string().required(),
  termination_timestamp_utc_iso_string: Yup.string().required(),
  termination_pastel_block_height: Yup.number().integer().required(),
  credit_purchase_request_termination_message_version_string: Yup.string().required(),
  responding_supernode_pastelid: Yup.string().required(),
  sha3_256_hash_of_credit_pack_purchase_request_termination_fields: Yup.string().required(),
  responding_supernode_signature_on_credit_pack_purchase_request_termination_hash: Yup.string().required(),
});

export const creditPackPurchaseRequestResponseSchema = Yup.object({
  id: uuidv4().required(),
  sha3_256_hash_of_credit_pack_purchase_request_fields: Yup.string().required(),
  credit_pack_purchase_request_fields_json_b64: Yup.string().required(),
  psl_cost_per_credit: Yup.number().required(),
  proposed_total_cost_of_credit_pack_in_psl: Yup.number().required(),
  credit_usage_tracking_psl_address: Yup.string().required(),
  request_response_timestamp_utc_iso_string: Yup.string().required(),
  request_response_pastel_block_height: Yup.number().integer().required(),
  best_block_merkle_root: Yup.string().required(),
  best_block_height: Yup.number().integer().required(),
  credit_purchase_request_response_message_version_string: Yup.string().required(),
  responding_supernode_pastelid: Yup.string().required(),
  list_of_blacklisted_supernode_pastelids: Yup.string().required(),
  list_of_potentially_agreeing_supernodes: Yup.string().required(),
  list_of_supernode_pastelids_agreeing_to_credit_pack_purchase_terms: Yup.string().required(),
  list_of_supernode_pastelids_agreeing_to_credit_pack_purchase_terms_selected_for_signature_inclusion: Yup.string().required(),
  selected_agreeing_supernodes_signatures_dict: Yup.string().required(),
  sha3_256_hash_of_credit_pack_purchase_request_response_fields: Yup.string().required(),
  responding_supernode_signature_on_credit_pack_purchase_request_response_hash: Yup.string().required(),
});

export const creditPackPurchaseRequestConfirmationSchema = Yup.object({
  id: uuidv4().required(),
  sha3_256_hash_of_credit_pack_purchase_request_fields: Yup.string().required(),
  sha3_256_hash_of_credit_pack_purchase_request_response_fields: Yup.string().required(),
  credit_pack_purchase_request_fields_json_b64: Yup.string().required(),
  requesting_end_user_pastelid: Yup.string().required(),
  txid_of_credit_purchase_burn_transaction: Yup.string().required(),
  credit_purchase_request_confirmation_utc_iso_string: Yup.string().required(),
  credit_purchase_request_confirmation_pastel_block_height: Yup.number().integer().required(),
  credit_purchase_request_confirmation_message_version_string: Yup.string().required(),
  sha3_256_hash_of_credit_pack_purchase_request_confirmation_fields: Yup.string().required(),
  requesting_end_user_pastelid_signature_on_sha3_256_hash_of_credit_pack_purchase_request_confirmation_fields: Yup.string().required(),
});

export const creditPackPurchaseRequestConfirmationResponseSchema = Yup.object({
  id: uuidv4().required(),
  sha3_256_hash_of_credit_pack_purchase_request_fields: Yup.string().required(),
  sha3_256_hash_of_credit_pack_purchase_request_confirmation_fields: Yup.string().required(),
  credit_pack_confirmation_outcome_string: Yup.string().required(),
  pastel_api_credit_pack_ticket_registration_txid: Yup.string().required(),
  credit_pack_confirmation_failure_reason_if_applicable: Yup.string().nullable(),
  credit_purchase_request_confirmation_response_utc_iso_string: Yup.string().required(),
  credit_purchase_request_confirmation_response_pastel_block_height: Yup.number().integer().required(),
  credit_purchase_request_confirmation_response_message_version_string: Yup.string().required(),
  responding_supernode_pastelid: Yup.string().required(),
  sha3_256_hash_of_credit_pack_purchase_request_confirmation_response_fields: Yup.string().required(),
  responding_supernode_signature_on_credit_pack_purchase_request_confirmation_response_hash: Yup.string().required(),
});

export const creditPackRequestStatusCheckSchema = Yup.object({
  id: uuidv4().required(),
  sha3_256_hash_of_credit_pack_purchase_request_fields: Yup.string().required(),
  requesting_end_user_pastelid: Yup.string().required(),
  requesting_end_user_pastelid_signature_on_sha3_256_hash_of_credit_pack_purchase_request_fields: Yup.string().required(),
});

export const creditPackPurchaseRequestStatusSchema = Yup.object({
  sha3_256_hash_of_credit_pack_purchase_request_fields: Yup.string().required(),
  sha3_256_hash_of_credit_pack_purchase_request_response_fields: Yup.string().required(),
  status: Yup.string().required(),
  status_details: Yup.string().required(),
  status_update_timestamp_utc_iso_string: Yup.string().required(),
  status_update_pastel_block_height: Yup.number().integer().required(),
  credit_purchase_request_status_message_version_string: Yup.string().required(),
  responding_supernode_pastelid: Yup.string().required(),
  sha3_256_hash_of_credit_pack_purchase_request_status_fields: Yup.string().required(),
  responding_supernode_signature_on_credit_pack_purchase_request_status_hash: Yup.string().required(),
});

export const creditPackStorageRetryRequestSchema = Yup.object({
  sha3_256_hash_of_credit_pack_purchase_request_response_fields: Yup.string().required(),
  credit_pack_purchase_request_fields_json_b64: Yup.string().required(),
  requesting_end_user_pastelid: Yup.string().required(),
  closest_agreeing_supernode_to_retry_storage_pastelid: Yup.string().required(),
  credit_pack_storage_retry_request_timestamp_utc_iso_string: Yup.string().required(),
  credit_pack_storage_retry_request_pastel_block_height: Yup.number().integer().required(),
  credit_pack_storage_retry_request_message_version_string: Yup.string().required(),
  sha3_256_hash_of_credit_pack_storage_retry_request_fields: Yup.string().required(),
  requesting_end_user_pastelid_signature_on_credit_pack_storage_retry_request_hash: Yup.string().required(),
});

export const creditPackStorageRetryRequestResponseSchema = Yup.object({
  sha3_256_hash_of_credit_pack_purchase_request_fields: Yup.string().required(),
  sha3_256_hash_of_credit_pack_purchase_request_confirmation_fields: Yup.string().required(),
  credit_pack_storage_retry_confirmation_outcome_string: Yup.string().required(),
  pastel_api_credit_pack_ticket_registration_txid: Yup.string().required(),
  credit_pack_storage_retry_confirmation_failure_reason_if_applicable: Yup.string().required(),
  credit_pack_storage_retry_confirmation_failure_reason_if_applicable: Yup.string().required(),
  credit_pack_storage_retry_confirmation_response_utc_iso_string: Yup.string().required(),
  credit_pack_storage_retry_confirmation_response_pastel_block_height: Yup.number().integer().required(),
  credit_pack_storage_retry_confirmation_response_message_version_string: Yup.string().required(),
  closest_agreeing_supernode_to_retry_storage_pastelid: Yup.string().required(),
  sha3_256_hash_of_credit_pack_storage_retry_confirmation_response_fields: Yup.string().required(),
  closest_agreeing_supernode_to_retry_storage_pastelid_signature_on_credit_pack_storage_retry_confirmation_response_hash: Yup.string().required(),
});

export const inferenceAPIUsageRequestSchema = Yup.object({
  inference_request_id: uuidv4().required(),
  requesting_pastelid: Yup.string().required(),
  credit_pack_ticket_pastel_txid: Yup.string().required(),
  requested_model_canonical_string: Yup.string().required(),
  model_inference_type_string: Yup.string().required(),
  model_parameters_json_b64: Yup.string().required(),
  model_input_data_json_b64: Yup.string().required(),
  inference_request_utc_iso_string: Yup.string().required(),
  inference_request_pastel_block_height: Yup.number().integer().required(),
  status: Yup.string().required(),
  inference_request_message_version_string: Yup.string().required(),
  sha3_256_hash_of_inference_request_fields: Yup.string().required(),
  requesting_pastelid_signature_on_request_hash: Yup.string().required(),
});

export const inferenceAPIUsageResponseSchema = Yup.object({
  inference_response_id: Yup.string().required(),
  inference_request_id: Yup.string().required(),
  proposed_cost_of_request_in_inference_credits: Yup.number().required(),
  remaining_credits_in_pack_after_request_processed: Yup.number().required(),
  credit_usage_tracking_psl_address: Yup.string().required(),
  request_confirmation_message_amount_in_patoshis: Yup.number().integer().required(),
  max_block_height_to_include_confirmation_transaction: Yup.number().integer().required(),
  inference_request_response_utc_iso_string: Yup.string().required(),
  inference_request_response_pastel_block_height: Yup.number().integer().required(),
  inference_request_response_message_version_string: Yup.string().required(),
  sha3_256_hash_of_inference_request_response_fields: Yup.string().required(),
  supernode_pastelid_and_signature_on_inference_request_response_hash: Yup.string().required(),
});

export const inferenceAPIOutputResultSchema = Yup.object({
  inference_result_id: Yup.string().required(),
  inference_request_id: Yup.string().required(),
  inference_response_id: Yup.string().required(),
  responding_supernode_pastelid: Yup.string().required(),
  inference_result_json_base64: Yup.string().required(),
  inference_result_file_type_strings: Yup.string().required(),
  inference_result_utc_iso_string: Yup.string().required(),
  inference_result_pastel_block_height: Yup.number().integer().required(),
  inference_result_message_version_string: Yup.string().required(),
  sha3_256_hash_of_inference_result_fields: Yup.string().required(),
  responding_supernode_signature_on_inference_result_id: Yup.string().required(),
});

export const inferenceConfirmationSchema = Yup.object({
  inference_request_id: Yup.string().required(),
  requesting_pastelid: Yup.string().required(),
  confirmation_transaction: Yup.object().required(),
});

// Utility function to validate data against a schema
export async function validateSchema(schema, data) {
  try {
    await schema.validate(data, { abortEarly: false });
    return { isValid: true, errors: null };
  } catch (error) {
    if (error.name === 'ValidationError') {
      return { isValid: false, errors: error.errors };
    }
    throw error;
  }
}