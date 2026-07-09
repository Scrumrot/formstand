import { TextField } from "@mui/material";
import { muiTextFieldProps } from "../../muiAdapter";
import { useOnboardingField } from "../hooks";

export type UnitFieldProps = Readonly<{ label?: string }>;

export const useUnitField = () => useOnboardingField("address.unit");

export const UnitField = ({ label = "Unit / apt (optional)" }: UnitFieldProps) => {
  const field = useUnitField();
  return <TextField fullWidth label={label} {...muiTextFieldProps(field)} />;
};
