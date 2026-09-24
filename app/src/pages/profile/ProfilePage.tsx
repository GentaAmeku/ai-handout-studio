import { useQuery } from "@tanstack/react-query";
import type { FormEvent } from "react";
import { profileQuery, useSaveProfile } from "../../api/queries";
import { useLanguage } from "../../i18n/language";
import type { Profile } from "../../schema/profile";
import { SearchButton } from "../../search/SearchButton";

// プロフィールが無いときの出発点
const DEFAULT_PROFILE: Profile = {
  orgName: "",
};

const readProfile = (form: FormData): Profile => {
  const text = (name: string) => String(form.get(name) ?? "").trim();
  return {
    orgName: text("orgName"),
  };
};

const ProfileForm = ({ profile }: { profile: Profile }) => {
  const { t } = useLanguage();
  const saveProfile = useSaveProfile();

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    saveProfile.mutate(readProfile(new FormData(event.currentTarget)));
  };

  return (
    <form className="profile-form" onSubmit={handleSubmit}>
      <section className="prose-section">
        <label className="field">
          <span className="field__label">{t("profile.orgName")}</span>
          <input
            name="orgName"
            className="input"
            defaultValue={profile.orgName}
            maxLength={100}
            autoComplete="off"
          />
          <span className="prop-field__hint">{t("profile.orgHint")}</span>
        </label>
      </section>

      {saveProfile.isError && (
        <p className="form-error" role="alert">
          {saveProfile.error.message}
        </p>
      )}
      {saveProfile.isSuccess && (
        <p className="prop-field__hint" role="status">
          {t("profile.saved")}
        </p>
      )}
      <div className="dialog__actions">
        <button
          type="submit"
          className="button button--primary"
          disabled={saveProfile.isPending}
        >
          {saveProfile.isPending ? t("profile.saving") : t("profile.save")}
        </button>
      </div>
    </form>
  );
};

export const ProfilePage = () => {
  const { t } = useLanguage();
  const profile = useQuery(profileQuery);

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1 className="page-title">{t("profile.title")}</h1>
          <p className="page-lead">{t("profile.lead")}</p>
        </div>
        <SearchButton />
      </header>
      {profile.isPending && (
        <p className="state-message">{t("common.loading")}</p>
      )}
      {profile.isError && (
        <p className="state-message state-message--error">
          {profile.error.message}
        </p>
      )}
      {profile.isSuccess && (
        <ProfileForm profile={profile.data.profile ?? DEFAULT_PROFILE} />
      )}
    </div>
  );
};
