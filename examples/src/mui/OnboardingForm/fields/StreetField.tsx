import { TextField } from "@mui/material";
import { muiTextFieldProps } from "../../muiAdapter";
import { useOnboardingField } from "../hooks";

export type StreetFieldProps = Readonly<{ label?: string }>;

export const useStreetField = () => useOnboardingField("address.street");

export const StreetField = ({ label = "Street" }: StreetFieldProps) => {
  const field = useStreetField();
  return <TextField fullWidth label={label} {...muiTextFieldProps(field)} />;
};
