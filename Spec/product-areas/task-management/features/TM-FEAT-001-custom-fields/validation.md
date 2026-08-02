# TM-FEAT-001 validation

**Immutable build or commit:** Not tested

**Environment:** Not tested

**Executor:** Not tested

**Date:** Not tested

Runtime validation has not run. Every item remains unchecked until it is executed against the immutable build recorded above.

## Configuration

- [ ] **AC-01 / TM-CF-101 / TM-CF-102:** Applying a defined group adds only missing category-field pairs and preserves existing configuration.
- [ ] **AC-02 / TM-CF-102 / TM-CF-107:** Removing a disaster context leaves fields intact until an authorized explicit deactivation.
- [ ] **AC-03 / TM-CF-116:** A group whose fields hold no values reverts as one action; after a value is entered under any of them, reversal is unavailable and deactivation is offered instead.
- [ ] **AC-04 / TM-CF-103:** Adding a field starts with library search, and selecting an existing entry produces one field identity rather than two.
- [ ] **AC-05 / TM-CF-115:** Entering a name similar to an existing field names the similar fields, and creation still succeeds when the Super Admin continues.
- [ ] **AC-06 / TM-CF-110:** One field attached to two categories is required in one and optional in the other, and changing one does not change the other.

## Identity and correction

- [ ] **AC-07 / TM-CF-109:** After renaming a field that holds values, every value remains attached and reporting treats them as one series.
- [ ] **AC-12 / TM-CF-113:** After changing a text field to a number field, new entries reject non-numeric input, existing values are unchanged, and non-numeric values are marked as non-conforming.
- [ ] **AC-13 / TM-CF-114:** After withdrawing a list choice, new entries cannot select it and Tasks that already reference it still display and report it.

## Permission and data retention

- [ ] **AC-08 / TM-CF-104:** Super Admin changes succeed and equivalent changes from every other role are refused by the server boundary.
- [ ] **AC-08 / TM-CF-104:** A non-Super-Admin signed-in user can read the configuration and render a complete Task form.
- [ ] **AC-08 / TM-CF-104:** The guest intake form contains no configurable fields.
- [ ] **AC-08 / TM-CF-104:** Direct API use cannot bypass configuration authority.
- [ ] **AC-14 / TM-CF-107:** Deactivation hides the field from a newly opened form while historical values remain readable and cannot be deleted through configuration.
- [ ] **AC-14 / TM-CF-107:** Reactivating a field that was required at deactivation returns it as required.
- [ ] **AC-14 / TM-CF-107:** Deactivating a field for one category leaves it active on another category that uses the same field.

## Required state and closure

- [ ] **AC-09 / TM-CF-106:** Forms expose only required or optional state, evaluate no conditional requirement, and save successfully with required fields empty.
- [ ] **AC-10 / TM-CF-111:** Closing a Task with an empty required field is refused and the empty fields are named; closure succeeds once they hold values.
- [ ] **AC-09 / TM-CF-106:** Field configuration does not add Task categories, conditional rules, or guest-disclosure behavior.

## Non-retroactivity

- [ ] **AC-11 / TM-CF-112:** A Task created before a field became required closes without that field; a Task created afterwards does not.
- [ ] **AC-11 / TM-CF-112:** A form opened before a field was deactivated saves that field's value successfully.
- [ ] **AC-11 / TM-CF-112:** No configuration change alters or removes a previously collected value.

## Failure, concurrency, and offline behavior

- [ ] **AC-15 / TM-CF-108:** A rejected, stale, conflicting, or offline change preserves the last accepted configuration and all collected values.
- [ ] **AC-15 / TM-CF-117:** Two Super Admins changing different fields from screens loaded at different times both keep their changes.

## Presentation

- [ ] **AC-16 / TM-CF-118:** A form with required and optional fields shows required fields above a visible separator, with the optional section expanded.
- [ ] **AC-16 / TM-CF-118:** A field added since the member last filled this form is marked as new, and the mark disappears after they first fill it.
- [ ] **AC-17 / TM-CF-119:** A Task of the medical category, which has no configured fields, can be created, saved, and closed, and its form shows no configurable-field section.
- [ ] **AC-17 / TM-CF-119:** After a Super Admin adds a field to a category that had none, the field appears on that category's form like any other.
- [ ] **AC-17 / TM-CF-119:** Deactivating the last remaining field of a category leaves the category selectable at intake.
- [ ] **AC-18 / TM-CF-120:** A newly deployed system presents the medical form with casualty count and condition of the worst affected as required, plus the two optional fields.
- [ ] **AC-18 / TM-CF-120:** The condition field offers the five listed choices in order, and no choice states a triage level or any other clinical classification.
- [ ] **AC-18 / TM-CF-120:** Selecting "not sure" satisfies the required state and allows closure; leaving the field empty does not.
- [ ] **AC-18 / TM-CF-120:** A casualty count of zero satisfies the required state; an empty count does not.
- [ ] **AC-18 / TM-CF-120:** Every shipped field outside the two required medical fields starts optional.
- [ ] **AC-18 / TM-CF-120 / TM-CF-107:** A Super Admin can deactivate or change a shipped starting field exactly as with any added field.

## End-to-end

- [ ] **AC-01 / AC-04 / AC-06 / AC-09 / AC-10 / AC-11 / AC-14 / AC-15:** A Super Admin applies a group and adds one local field required for rescue and optional for supply; staff create and save a Task with the required field empty; closure is refused; the field is filled and closure succeeds; the Super Admin then deactivates the field while a second Task created earlier still closes under its original configuration and all collected values stay readable.
