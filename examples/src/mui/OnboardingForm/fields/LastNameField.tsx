import { TextField } from "@mui/material";
import { muiTextFieldProps } from "../../muiAdapter";
import { useOnboardingField } from "../hooks";

export type LastNameFieldProps = Readonly<{ label?: string }>;

export const useLastNameField = () => useOnboardingField("personal.lastName");

export const LastNameField = ({ label = "Last name" }: LastNameFieldProps) => {
  const field = useLastNameField();
  return <TextField fullWidth label={label} {...muiTextFieldProps(field)} />;
};
