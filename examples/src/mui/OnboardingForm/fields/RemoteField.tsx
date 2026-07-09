import { Checkbox, FormControlLabel } from "@mui/material";
import { muiSwitchProps } from "../../muiAdapter";
import { useOnboardingField } from "../hooks";

export type RemoteFieldProps = Readonly<{ label?: string }>;

export const useRemoteField = () => useOnboardingField("employment.remote");

export const RemoteField = ({ label = "Fully remote" }: RemoteFieldProps) => {
  const field = useRemoteField();
  return (
    <FormControlLabel
      label={label}
      control={<Checkbox {...muiSwitchProps(field)} />}
    />
  );
};
