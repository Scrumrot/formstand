import {
  FormControl,
  FormHelperText,
  InputLabel,
  MenuItem,
  Select,
} from "@mui/material";
import { muiSelectProps } from "../../muiAdapter";
import { SHIRT_SIZE_OPTIONS } from "../schema";
import { useOnboardingField } from "../hooks";

export type ShirtSizeFieldProps = Readonly<{ label?: string }>;

export const useShirtSizeField = () => useOnboardingField("equipment.shirtSize");

export const ShirtSizeField = ({ label = "Shirt size" }: ShirtSizeFieldProps) => {
  const field = useShirtSizeField();
  const props = muiSelectProps(field);
  return (
    <FormControl fullWidth error={props.error}>
      <InputLabel id="onbmui-ShirtSizeField-label">{label}</InputLabel>
      <Select labelId="onbmui-ShirtSizeField-label" label={label} {...props}>
        {SHIRT_SIZE_OPTIONS.map((option) => (
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
