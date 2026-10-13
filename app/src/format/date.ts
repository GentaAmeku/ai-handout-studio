// 資料まわりで使う日付の書き方。開いた先の情報は時刻まで(formatDateTime)を使う。
// 資料一覧のカードはもう日付を出さない。リスト表示の行(184)は更新日時を時刻まで出す

const pad = (value: number) => String(value).padStart(2, "0");

export const formatDate = (iso: string): string => {
  const date = new Date(iso);
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())}`;
};

export const formatDateTime = (iso: string): string => {
  const date = new Date(iso);
  return `${formatDate(iso)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};
