import {
  FormControl,
  FormHelperText,
  InputLabel,
  MenuItem,
  Select,
} from "@mui/material";
import { muiSelectProps } from "../../muiAdapter";
import { LAPTOP_OPTIONS } from "../schema";
import { useOnboardingField } from "../hooks";

export type LaptopFieldProps = Readonly<{ label?: string }>;

export const useLaptopField = () => useOnboardingField("equipment.laptop");

export const LaptopField = ({ label = "Laptop" }: LaptopFieldProps) => {
  const field = useLaptopField();
  const props = muiSelectProps(field);
  return (
    <FormControl fullWidth error={props.error}>
      <InputLabel id="onbmui-LaptopField-label">{label}</InputLabel>
      <Select labelId="onbmui-LaptopField-label" label={label} {...props}>
        {LAPTOP_OPTIONS.map((option) => (
          <MenuItem key={option.value} value={option.value}>
            {option.label}
          </MenuItem>
        ))}
      </Select>
      {field.error?.[0] !== undefined ? (
        <FormHelperText>{field.error?.[0]}</FormHelperText>
      ) : null}
    </FormControl>
  );
};
