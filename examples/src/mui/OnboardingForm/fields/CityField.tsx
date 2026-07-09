import { TextField } from "@mui/material";
import { muiTextFieldProps } from "../../muiAdapter";
import { useOnboardingField } from "../hooks";

export type CityFieldProps = Readonly<{ label?: string }>;

export const useCityField = () => useOnboardingField("address.city");

export const CityField = ({ label = "City" }: CityFieldProps) => {
  const field = useCityField();
  return <TextField fullWidth label={label} {...muiTextFieldProps(field)} />;
};
