import { TextField } from "@mui/material";
import { muiTextFieldProps } from "../../muiAdapter";
import { useOnboardingField } from "../hooks";

export type PhoneFieldProps = Readonly<{ label?: string }>;

export const usePhoneField = () => useOnboardingField("personal.phone");

export const PhoneField = ({ label = "Phone" }: PhoneFieldProps) => {
  const field = usePhoneField();
  return <TextField fullWidth type="tel" label={label} {...muiTextFieldProps(field)} />;
};
