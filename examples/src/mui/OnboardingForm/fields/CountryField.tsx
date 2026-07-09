import {
  FormControl,
  FormHelperText,
  InputLabel,
  MenuItem,
  Select,
} from "@mui/material";
import { muiSelectProps } from "../../muiAdapter";
import { COUNTRY_OPTIONS } from "../schema";
import { useOnboardingField } from "../hooks";

export type CountryFieldProps = Readonly<{ label?: string }>;

export const useCountryField = () => useOnboardingField("address.country");

export const CountryField = ({ label = "Country" }: CountryFieldProps) => {
  const field = useCountryField();
  const props = muiSelectProps(field);
  return (
    <FormControl fullWidth error={props.error}>
      <InputLabel id="onbmui-CountryField-label">{label}</InputLabel>
      <Select labelId="onbmui-CountryField-label" label={label} {...props}>
        {COUNTRY_OPTIONS.map((option) => (
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
