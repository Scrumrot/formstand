export type ValidationMode =
  | "onChange"
  | "onBlur"
  | "onSubmit"
  // Validate on blur always; on change only once the field has been touched.
  | "onTouched"
  // Validate on both change and blur.
  | "all";

export type ValidationTrigger = "change" | "blur";

export const shouldValidateOn = (
  trigger: ValidationTrigger,
  mode: ValidationMode,
  reValidateMode: ValidationMode,
  submitAttempted: boolean,
  touched: boolean = false,
): boolean => {
  const effective = submitAttempted ? reValidateMode : mode;
  switch (effective) {
    case "onChange":
      return trigger === "change" || trigger === "blur";
    case "onBlur":
      return trigger === "blur";
    case "onSubmit":
      return false;
    case "onTouched":
      return trigger === "blur" || touched;
    case "all":
      return true;
  }
};
