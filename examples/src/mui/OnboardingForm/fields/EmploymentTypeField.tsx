import {
  FormControl,
  FormHelperText,
  InputLabel,
  MenuItem,
  Select,
} from "@mui/material";
import { muiSelectProps } from "../../muiAdapter";
import { EMPLOYMENT_TYPE_OPTIONS } from "../schema";
import { useOnboardingField } from "../hooks";

export type EmploymentTypeFieldProps = Readonly<{ label?: string }>;

export const useEmploymentTypeField = () => useOnboardingField("employment.employmentType");

export const EmploymentTypeField = ({ label = "Employment type" }: EmploymentTypeFieldProps) => {
  const field = useEmploymentTypeField();
  const props = muiSelectProps(field);
  return (
    <FormControl fullWidth error={props.error}>
      <InputLabel id="onbmui-EmploymentTypeField-label">{label}</InputLabel>
      <Select labelId="onbmui-EmploymentTypeField-label" label={label} {...props}>
        {EMPLOYMENT_TYPE_OPTIONS.map((option) => (
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
