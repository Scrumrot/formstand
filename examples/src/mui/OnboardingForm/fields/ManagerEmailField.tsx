import { TextField } from "@mui/material";
import { muiTextFieldProps } from "../../muiAdapter";
import { useOnboardingField } from "../hooks";

export type ManagerEmailFieldProps = Readonly<{ label?: string }>;

export const useManagerEmailField = () => useOnboardingField("employment.managerEmail");

export const ManagerEmailField = ({ label = "Manager's email" }: ManagerEmailFieldProps) => {
  const field = useManagerEmailField();
  return <TextField fullWidth type="email" label={label} {...muiTextFieldProps(field)} />;
};
