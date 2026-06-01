export type ValidationMode = "onChange" | "onBlur" | "onSubmit" | "all";

export type ValidationTrigger = "change" | "blur";

export const shouldValidateOn = (
  trigger: ValidationTrigger,
  mode: ValidationMode,
  reValidateMode: ValidationMode,
  submitAttempted: boolean,
): boolean => {
  const effective = submitAttempted ? reValidateMode : mode;
  switch (effective) {
    case "onChange":
    case "all":
      return true;
    case "onBlur":
      return trigger === "blur";
    case "onSubmit":
      return false;
  }
};
