import {
  textInputProps,
  useField,
  useForm,
  useFormState,
} from "zustand-forms";
import { z } from "zod";
import { StateDump } from "./StateDump";

const REGIONS = {
  us: ["California", "New York", "Texas"],
  uk: ["England", "Scotland", "Wales"],
  ca: ["Ontario", "Quebec", "British Columbia"],
} as const;

type Country = keyof typeof REGIONS;

const schema = z.object({
  country: z.enum(["us", "uk", "ca"] as const),
  region: z.string().min(1, "pick a region"),
  city: z.string().min(1, "city required"),
});

export const DependentFieldsForm = () => {
  const form = useForm(schema, {
    initialValues: { country: "us", region: "", city: "" },
    mode: "onBlur",
  });
  const country = useField(form, "country");
  const region = useField(form, "region");
  const city = useField(form, "city");
  const currentCountry = useFormState(form, (s) => s.values.country);

  const onCountryChange = (next: Country) => {
    country.setValue(next);
    region.setValue("");
    region.clearError();
  };

  const availableRegions = REGIONS[currentCountry];

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void form.submit((data) => {
          window.alert(`address: ${JSON.stringify(data)}`);
        });
      }}
    >
      <p className="subtitle">
        Changing country clears the region. Region options update reactively
        based on the selected country.
      </p>

      <div className="field">
        <label>Country</label>
        <select
          value={country.value}
          onChange={(e) => onCountryChange(e.target.value as Country)}
          onBlur={country.onBlur}
        >
          <option value="us">United States</option>
          <option value="uk">United Kingdom</option>
          <option value="ca">Canada</option>
        </select>
        <span className="error">{country.error?.[0] ?? " "}</span>
      </div>

      <div className="field">
        <label>Region</label>
        <select
          value={region.value}
          onChange={(e) => region.setValue(e.target.value)}
          onBlur={region.onBlur}
        >
          <option value="">Select a region...</option>
          {availableRegions.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <span className="error">{region.error?.[0] ?? " "}</span>
      </div>

      <div className="field">
        <label>City</label>
        <input {...textInputProps(city)} />
        <span className="error">{city.error?.[0] ?? " "}</span>
      </div>

      <button className="primary" type="submit">
        Submit
      </button>

      <StateDump form={form} />
    </form>
  );
};
