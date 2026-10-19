import {
  focusFirstError,
  textInputProps,
  useField,
  useForm,
  useFormSelector,
} from "formstand";
import { useDemoForm } from "../demo/DemoShell";
import { fieldA11y } from "../demo/fieldA11y";
import { z } from "zod";

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
  useDemoForm(form);
  const country = useField(form, "country");
  const region = useField(form, "region");
  const city = useField(form, "city");
  const currentCountry = useFormSelector(form, (s) => s.values.country);
  const countryA11y = fieldA11y(country, "country");
  const regionA11y = fieldA11y(region, "region");
  const cityA11y = fieldA11y(city, "city");

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
        void form.submit(
          (data) => {
            window.alert(`address: ${JSON.stringify(data)}`);
          },
          (errors) => {
            focusFirstError(errors);
          },
        );
      }}
    >
      <p className="subtitle">
        Changing country clears the region. Region options update reactively
        based on the selected country.
      </p>

      <div className="field">
        <label htmlFor="country">Country</label>
        <select
          {...countryA11y.control}
          name={country.path}
          value={country.value}
          onChange={(e) => onCountryChange(e.target.value as Country)}
          onBlur={country.onBlur}
        >
          <option value="us">United States</option>
          <option value="uk">United Kingdom</option>
          <option value="ca">Canada</option>
        </select>
        <span {...countryA11y.message}>{country.error?.[0] ?? " "}</span>
      </div>

      <div className="field">
        <label htmlFor="region">Region</label>
        <select
          {...regionA11y.control}
          name={region.path}
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
        <span {...regionA11y.message}>{region.error?.[0] ?? " "}</span>
      </div>

      <div className="field">
        <label htmlFor="city">City</label>
        <input {...textInputProps(city)} {...cityA11y.control} />
        <span {...cityA11y.message}>{city.error?.[0] ?? " "}</span>
      </div>

      <button className="primary" type="submit">
        Submit
      </button>
    </form>
  );
};
