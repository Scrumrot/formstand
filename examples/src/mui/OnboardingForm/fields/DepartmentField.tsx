import {
  FormControl,
  FormHelperText,
  InputLabel,
  MenuItem,
  Select,
} from "@mui/material";
import { muiSelectProps } from "../../muiAdapter";
import { DEPARTMENT_OPTIONS } from "../schema";
import { useOnboardingField } from "../hooks";

export type DepartmentFieldProps = Readonly<{ label?: string }>;

export const useDepartmentField = () => useOnboardingField("employment.department");

export const DepartmentField = ({ label = "Department" }: DepartmentFieldProps) => {
  const field = useDepartmentField();
  const props = muiSelectProps(field);
  return (
    <FormControl fullWidth error={props.error}>
      <InputLabel id="onbmui-DepartmentField-label">{label}</InputLabel>
      <Select labelId="onbmui-DepartmentField-label" label={label} {...props}>
        {DEPARTMENT_OPTIONS.map((option) => (
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
