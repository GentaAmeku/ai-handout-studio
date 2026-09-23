import "../editor/editor.css";
import "./documents.css";
import { DocumentEditorLoader } from "./DocumentEditor";

// /documents/<id>。HTML 資料を読んで直して保存する画面
export const DocumentEditorPage = ({ id }: { id: string }) => (
  <DocumentEditorLoader id={id} />
);
