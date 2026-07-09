import { useOnboardingIsDirty, useOnboardingIsValid } from "../hooks";
import { StreetField } from "../fields/StreetField";
import { UnitField } from "../fields/UnitField";
import { CityField } from "../fields/CityField";
import { RegionField } from "../fields/RegionField";
import { PostalCodeField } from "../fields/PostalCodeField";
import { CountryField } from "../fields/CountryField";

export type AddressSectionProps = Readonly<{ initiallyOpen?: boolean }>;

// The section hook is just the path-scoped flags: dirty/valid for this
// subtree only, as boolean-only subscriptions.
export const useAddressSection = () => ({
  dirty: useOnboardingIsDirty("address"),
  valid: useOnboardingIsValid("address"),
});

export const AddressSection = ({
  initiallyOpen = false,
}: AddressSectionProps) => {
  const { dirty, valid } = useAddressSection();
  return (
    <details open={initiallyOpen || undefined}>
      <summary style={{ cursor: "pointer", marginBottom: 8 }}>
        <strong>Address</strong>{" "}
        {dirty ? <span className="pending">edited</span> : null}{" "}
        {valid ? null : <span className="error">needs attention</span>}
      </summary>
      <StreetField />
      <UnitField />
      <CityField />
      <RegionField />
      <PostalCodeField />
      <CountryField />
    </details>
  );
};
