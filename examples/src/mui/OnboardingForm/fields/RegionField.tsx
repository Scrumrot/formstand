import {
  FormControl,
  FormHelperText,
  InputLabel,
  MenuItem,
  Select,
} from "@mui/material";
import { muiSelectProps } from "../../muiAdapter";
import { REGION_OPTIONS } from "../schema";
import { useOnboardingField } from "../hooks";

export type RegionFieldProps = Readonly<{ label?: string }>;

export const useRegionField = () => useOnboardingField("address.region");

export const RegionField = ({ label = "Region" }: RegionFieldProps) => {
  const field = useRegionField();
  const props = muiSelectProps(field);
  return (
    <FormControl fullWidth error={props.error}>
      <InputLabel id="onbmui-RegionField-label">{label}</InputLabel>
      <Select labelId="onbmui-RegionField-label" label={label} {...props}>
        {REGION_OPTIONS.map((option) => (
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
