import { TextField } from "@mui/material";
import { muiTextFieldProps } from "../../muiAdapter";
import { useOnboardingField } from "../hooks";

export type JobTitleFieldProps = Readonly<{ label?: string }>;

export const useJobTitleField = () => useOnboardingField("employment.jobTitle");

export const JobTitleField = ({ label = "Job title" }: JobTitleFieldProps) => {
  const field = useJobTitleField();
  return <TextField fullWidth label={label} {...muiTextFieldProps(field)} />;
};
