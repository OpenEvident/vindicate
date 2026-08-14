export const VALIDATION_ERROR_CODES = [
  "schema_shape",
  "owned_by_mismatch",
  "duplicate_element_ref",
  "field_name_collision",
  "ghost_element_ref",
  "fill_value_param_exclusive",
  "unknown_step_param",
  "duplicate_step_name",
  "duplicate_verify_name",
  "duplicate_ac_id",
  "invalid_assertion_arg",
  "locator_missing",
  "panel_has_path",
  "page_missing_path",
  "unknown_fixture",
  "unknown_body_call",
  "body_call_arg_count",
  "invalid_body_call_arg",
  "quoted_env_var_arg",
  "secret_in_step_value",
  "expected_block_missing",
  "unknown_expected_key",
  "empty_expected_block",
  "duplicate_expected_value",
  "use_expected_for_test_data",
  "inline_test_data_with_expected_block",
  "dynamic_placeholder_mismatch",
  "dynamic_ref_args",
  "waitforresponse_missing_observed",
  "waitforresponse_unobserved_endpoint",
  "waitforresponse_doc_placeholder",
  "malformed_url_glob",
  "missing_ac_prefix",
  "container_ignored_for_strategy",
  "baseurl_unsafe_url_glob",
  // API-layer codes (api-validate-codegen.ts) — the rest of this list is UI-only.
  "duplicate_client_class",
  "duplicate_client_fixture",
  "duplicate_client_method_name",
  "path_param_placeholder_mismatch",
  "unknown_client_fixture",
  "unknown_client_method",
  "client_method_arg_count",
  "invalid_api_call_arg",
  "unquoted_string_builder_default",
  "invalid_builder_default",
  "invalid_capture_name",
  "duplicate_capture_name",
  "ambiguous_capture_field",
  "leading_slash_path"
] as const;

export type ValidationErrorCode = (typeof VALIDATION_ERROR_CODES)[number];

export interface ValidationError {
  readonly code: ValidationErrorCode;
  readonly path: string;
  readonly message: string;
  readonly fix: string;
  readonly example?: string;
}

export interface ValidationResult {
  readonly valid: boolean;
  readonly errors: ValidationError[];
  readonly errorCount: number;
  readonly truncated: boolean;
}

export const MAX_VALIDATION_ERRORS = 25;

export function validationError(
  code: ValidationErrorCode,
  path: string,
  message: string,
  fix: string,
  example?: string
): ValidationError {
  return {
    code,
    path,
    message,
    fix,
    ...(example !== undefined ? { example } : {})
  };
}

export function finalizeValidationResult(errors: ValidationError[]): ValidationResult {
  const truncated = errors.length > MAX_VALIDATION_ERRORS;
  const visible = truncated ? errors.slice(0, MAX_VALIDATION_ERRORS) : errors;
  return {
    valid: errors.length === 0,
    errors: visible,
    errorCount: errors.length,
    truncated
  };
}
