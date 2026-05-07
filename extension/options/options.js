const DEFAULT_EEO = {
  gender: "Prefer not to say",
  race_ethnicity: "Prefer not to answer",
  veteran_status: "I don't wish to answer",
  disability_status: "I don't wish to answer",
};

const STATE_ABBR_TO_NAME = {
  AL:"Alabama",AK:"Alaska",AZ:"Arizona",AR:"Arkansas",CA:"California",
  CO:"Colorado",CT:"Connecticut",DE:"Delaware",DC:"D.C.",FL:"Florida",
  GA:"Georgia",HI:"Hawaii",ID:"Idaho",IL:"Illinois",IN:"Indiana",
  IA:"Iowa",KS:"Kansas",KY:"Kentucky",LA:"Louisiana",ME:"Maine",
  MD:"Maryland",MA:"Massachusetts",MI:"Michigan",MN:"Minnesota",
  MS:"Mississippi",MO:"Missouri",MT:"Montana",NE:"Nebraska",NV:"Nevada",
  NH:"New Hampshire",NJ:"New Jersey",NM:"New Mexico",NY:"New York",
  NC:"North Carolina",ND:"North Dakota",OH:"Ohio",OK:"Oklahoma",
  OR:"Oregon",PA:"Pennsylvania",RI:"Rhode Island",SC:"South Carolina",
  SD:"South Dakota",TN:"Tennessee",TX:"Texas",UT:"Utah",VT:"Vermont",
  VA:"Virginia",WA:"Washington",WV:"West Virginia",WI:"Wisconsin",WY:"Wyoming",
};

function expandState(val) {
  if (!val) return "";
  const u = val.trim().toUpperCase();
  return STATE_ABBR_TO_NAME[u] || val;
}

function setField(id, val) {
  const el = document.getElementById(id);
  if (el && val != null && val !== "") el.value = val;
}

async function load() {
  const data = await chrome.storage.local.get(["careeros_profile", "careeros_api_base"]);
  const profile = data.careeros_profile || {};
  const personal = profile.personal || {};
  const workAuth = profile.work_auth || {};
  const eeo = profile.demographics || DEFAULT_EEO;

  setField("firstName", personal.firstName);
  setField("lastName", personal.lastName);
  setField("email", personal.email);
  setField("phone", personal.phone);
  setField("city", personal.city);
  setField("state", personal.state || personal.stateAbbr);
  setField("zip", personal.zip);
  setField("linkedin", personal.linkedin);
  setField("github", personal.github);
  setField("portfolio", personal.portfolio);
  setField("authorized", String(workAuth.authorized ?? true));
  setField("requires_sponsorship", String(workAuth.requires_sponsorship ?? false));
  setField("visa_status", workAuth.visa_status);
  setField("api_base", data.careeros_api_base || "http://localhost:5001");
  setField("eeo_gender", eeo.gender);
  setField("eeo_race", eeo.race_ethnicity);
  setField("eeo_veteran", eeo.veteran_status);
  setField("eeo_disability", eeo.disability_status);
}

document.getElementById("btn-sync").addEventListener("click", async () => {
  const syncErr = document.getElementById("sync-err");
  const syncMsg = document.getElementById("sync-msg");
  syncErr.classList.remove("show");
  syncMsg.classList.remove("show");

  let res;
  try {
    res = await chrome.runtime.sendMessage({ type: "GET_AUTOFILL_PROFILE" });
  } catch (e) {
    syncErr.classList.add("show");
    setTimeout(() => syncErr.classList.remove("show"), 4000);
    return;
  }

  if (!res?.ok || !res.profile) {
    syncErr.classList.add("show");
    setTimeout(() => syncErr.classList.remove("show"), 4000);
    return;
  }

  const p = res.profile;
  const personal = p.personal || {};
  const workAuth = p.work_auth || {};
  const eeo = p.demographics || {};

  // Only overwrite fields that have a real value from the API
  const fill = (id, val) => { if (val) setField(id, val); };
  fill("firstName", personal.firstName);
  fill("lastName", personal.lastName);
  fill("email", personal.email);
  fill("phone", personal.phone);
  fill("city", personal.city);
  fill("state", expandState(personal.state || personal.stateAbbr));
  fill("zip", personal.zip);
  fill("linkedin", personal.linkedin);
  fill("github", personal.github);
  fill("portfolio", personal.portfolio);
  fill("visa_status", workAuth.visa_status);
  if (workAuth.authorized != null) setField("authorized", String(workAuth.authorized));
  if (workAuth.requires_sponsorship != null) setField("requires_sponsorship", String(workAuth.requires_sponsorship));
  fill("eeo_gender", eeo.gender);
  fill("eeo_race", eeo.race_ethnicity || eeo.race);
  fill("eeo_veteran", eeo.veteran_status || eeo.veteran);
  fill("eeo_disability", eeo.disability_status || eeo.disability);

  syncMsg.classList.add("show");
  setTimeout(() => syncMsg.classList.remove("show"), 3000);
});

document.getElementById("btn-save").addEventListener("click", async () => {
  const g = (id) => document.getElementById(id)?.value?.trim() || "";

  const profile = {
    personal: {
      firstName: g("firstName"),
      lastName: g("lastName"),
      fullName: [g("firstName"), g("lastName")].filter(Boolean).join(" "),
      email: g("email"),
      phone: g("phone"),
      city: g("city"),
      state: g("state"),
      zip: g("zip"),
      country: "USA",
      linkedin: g("linkedin"),
      github: g("github"),
      portfolio: g("portfolio"),
    },
    work_auth: {
      authorized: g("authorized") === "true",
      requires_sponsorship: g("requires_sponsorship") === "true",
      visa_status: g("visa_status"),
    },
    demographics: {
      gender: g("eeo_gender") || DEFAULT_EEO.gender,
      race_ethnicity: g("eeo_race") || DEFAULT_EEO.race_ethnicity,
      veteran_status: g("eeo_veteran") || DEFAULT_EEO.veteran_status,
      disability_status: g("eeo_disability") || DEFAULT_EEO.disability_status,
    },
  };

  await chrome.storage.local.set({
    careeros_profile: profile,
    careeros_api_base: g("api_base") || "http://localhost:5001",
  });

  const msg = document.getElementById("saved-msg");
  msg.classList.add("show");
  setTimeout(() => msg.classList.remove("show"), 2000);
});

load();
