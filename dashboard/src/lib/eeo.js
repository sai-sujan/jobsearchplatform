/** Shared EEO option lists — used by OnboardingPage and Settings */

export const GENDER_OPTIONS = [
  'Male',
  'Female',
  'Non-binary',
  'Decline to self-identify',
  'Prefer not to say',
]

export const RACE_ETHNICITY_OPTIONS = [
  'Hispanic or Latino',
  'White (Not Hispanic or Latino)',
  'Black or African American (Not Hispanic or Latino)',
  'Asian (Not Hispanic or Latino)',
  'Native Hawaiian or Other Pacific Islander (Not Hispanic or Latino)',
  'American Indian or Alaska Native (Not Hispanic or Latino)',
  'Two or More Races (Not Hispanic or Latino)',
  'Prefer not to answer',
]

export const VETERAN_STATUS_OPTIONS = [
  'I identify as one or more of the classifications of a protected veteran',
  'I am a veteran, but I am not a protected veteran',
  'I am not a protected veteran',
  "I don't wish to answer",
]

export const DISABILITY_STATUS_OPTIONS = [
  'Yes, I have a disability, or have had one in the past',
  'No, I do not have a disability and have not had one in the past',
  "I don't wish to answer",
]

export const DEFAULT_EEO = {
  gender: 'Prefer not to say',
  race_ethnicity: 'Prefer not to answer',
  veteran_status: "I don't wish to answer",
  disability_status: "I don't wish to answer",
}
