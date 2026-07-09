import { TextField } from "@mui/material";
import { muiTextFieldProps } from "../../muiAdapter";
import { useOnboardingField } from "../hooks";

export type PostalCodeFieldProps = Readonly<{ label?: string }>;

export const usePostalCodeField = () => useOnboardingField("address.postalCode");

export const PostalCodeField = ({ label = "Postal code" }: PostalCodeFieldProps) => {
  const field = usePostalCodeField();
  return <TextField fullWidth label={label} {...muiTextFieldProps(field)} />;
};
