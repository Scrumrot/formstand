import { Checkbox, FormControlLabel } from "@mui/material";
import { muiSwitchProps } from "../../muiAdapter";
import { useOnboardingField } from "../hooks";

export type NeedsPhoneFieldProps = Readonly<{ label?: string }>;

export const useNeedsPhoneField = () => useOnboardingField("equipment.needsPhone");

export const NeedsPhoneField = ({ label = "Company phone needed" }: NeedsPhoneFieldProps) => {
  const field = useNeedsPhoneField();
  return (
    <FormControlLabel
      label={label}
      control={<Checkbox {...muiSwitchProps(field)} />}
    />
  );
};
