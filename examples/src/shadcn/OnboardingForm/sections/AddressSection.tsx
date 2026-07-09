import { Badge } from "../../ui/badge";
import { useOnboardingIsDirty, useOnboardingIsValid } from "../hooks";
import { StreetField } from "../fields/StreetField";
import { UnitField } from "../fields/UnitField";
import { CityField } from "../fields/CityField";
import { RegionField } from "../fields/RegionField";
import { PostalCodeField } from "../fields/PostalCodeField";
import { CountryField } from "../fields/CountryField";

export type AddressSectionProps = Readonly<{ initiallyOpen?: boolean }>;

// The section hook is the path-scoped flags: dirty/valid for this subtree
// only, rendered as badges in the summary.
export const useAddressSection = () => ({
  dirty: useOnboardingIsDirty("address"),
  valid: useOnboardingIsValid("address"),
});

export const AddressSection = ({
  initiallyOpen = false,
}: AddressSectionProps) => {
  const { dirty, valid } = useAddressSection();
  return (
    <details className="rounded-lg border" open={initiallyOpen || undefined}>
      <summary className="flex cursor-pointer select-none items-center gap-2 px-4 py-3 text-sm font-medium">
        Address
        {dirty ? <Badge>edited</Badge> : null}
        {valid ? null : (
          <span className="text-xs text-destructive">needs attention</span>
        )}
      </summary>
      <div className="grid gap-4 px-4 pb-4">
        <StreetField />
        <UnitField />
        <CityField />
        <RegionField />
        <PostalCodeField />
        <CountryField />
      </div>
    </details>
  );
};
