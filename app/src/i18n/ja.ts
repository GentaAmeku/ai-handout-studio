// 画面文言の日英辞書。キーは en.ts と一致させる(型で強制する)
// 資料データ・テンプレート文・サーバーメッセージは対象外

export const ja = {
  "common.loading": "読み込み中…",
  "common.cancel": "やめる",
  "common.close": "閉じる",
  "common.copy": "コピー",
  "common.copied": "コピーしました",
  "common.creating": "作成中…",
  "common.backToList": "資料一覧",
  // サーバーが断った書き込み。LAN から開いた画面や別のサイトから来た書き込み
  "api.localOnly":
    "この操作は、アプリを動かしている PC の画面から行ってください",
  "unit.pages": "{n} ページ",
  "unit.slides": "{n}枚",
  "unit.slidesParen": "({n}枚)",
  "unit.slidesSlash": " / {n}枚",
  "unit.sections": "{n}セクション",
  "unit.sectionsSlash": " / {n}セクション",
  "unit.issues": "{n} 件",
  "unit.questions": "{n} 問",

  "nav.main": "メイン",
  "nav.decks": "資料一覧",
  "nav.templates": "テンプレート",
  "nav.help": "使い方",
  "nav.settings": "設定",
  "nav.section.slide": "スライド",
  "nav.section.sheet": "質問票",
  "nav.section.document": "HTML 資料",
  "sections.sheet.listTitle": "質問票の資料一覧",
  "sections.document.listTitle": "HTML 資料の資料一覧",
  "sections.sheet.lead":
    "エージェントが作った質問票を並べます。テンプレートを替えて、1枚の HTML に書き出せます。",
  "sections.document.lead":
    "エージェントが作った HTML 資料を並べます。テンプレートを替えて、1枚の HTML に書き出せます。",
  "sections.sheet.howTo":
    "まだ質問票がありません。エージェントに question-sheet スキルで質問票を作ってもらうと、ここに並びます。",
  "sections.document.howTo":
    "まだ HTML 資料がありません。エージェントに ai-handout-studio スキルで資料を作ってもらうと、ここに並びます。",
  "handouts.unreadable": "中身が読めません",
  "handouts.answered": "回答あり",
  "handouts.backToList": "資料一覧",
  "handouts.template": "テンプレート",
  "handouts.editTemplate": "このテンプレートを直す",
  "handouts.layout": "レイアウト",
  "handouts.openFull": "原寸で開く",
  "handouts.export": "1枚の HTML に書き出す",
  "handouts.exporting": "書き出し中…",
  "handouts.exported": "書き出しました。ファイルはここにあります",
  "handouts.copyPath": "パスをコピー",
  "handouts.pathCopied": "コピーしました",
  "handouts.pathCopyFailed":
    "コピーできませんでした。表示している文字を選んでコピーしてください。",
  "handouts.copyOpenCommand": "フォルダを開くコマンドをコピー",
  "handouts.share": "共有の依頼をコピー",
  "handouts.sharing": "束を作成中…",
  "handouts.shareCopied":
    "✓ 共有の依頼をコピーしました。Claude Code の会話に貼ってください",
  "handouts.shareCopyFailed":
    "コピーできませんでした。下の欄を長押しして「すべて選択」→「コピー」してください。",
  "handouts.shared": "共有中",
  "handouts.shareFallback": "共有の依頼文",

  "nav.notFound": "ページが見つかりません。",
  "nav.notFoundBack": "資料一覧へ戻る",

  "decks.title": "スライドの資料一覧",
  "decks.lead":
    "エージェントが作ったスライドを並べます。テンプレートを替えて、PDF や PPTX に書き出せます。",
  "decks.empty":
    "まだ資料がありません。エージェントに ai-handout-studio スキルでスライドを作ってもらうと、ここに並びます。",
  "decks.noMatch": "条件に合う資料がありません。",
  "decks.filterLegend": "タグで絞り込む",
  "decks.filterAll": "すべて",

  // サイト内検索。Search の字はどちらの言語でも同じ
  "search.label": "Search",
  "search.noMatch": "見つかりませんでした",
  "search.loadError": "{names}を読み込めませんでした",
  "search.hintMove": "選ぶ",
  "search.hintOpen": "開く",
  "search.hintClose": "閉じる",

  "deckCard.delete": "削除する",
  "deckCard.editNamed": "{title}を編集",
  "deckCard.openNamed": "{title}を開く",
  "deckCard.deleteNamed": "{title}を削除",
  "deckCard.deleting": "削除中…",
  "deckCard.favorite": "お気に入りにする",
  "deckCard.unfavorite": "お気に入りから外す",
  "deckCard.favoriteNamed": "{title}をお気に入りにする",
  "list.favorites": "お気に入り",
  "deckCard.deleteConfirm":
    "「{title}」を削除しますか? この操作は取り消せません。",
  "deckCard.invalidTitle": "読み込めません",
  "deckCard.noSlides": "スライドがありません",
  "deckCard.statusDraft": "作成中",
  "deckCard.statusDone": "完成",

  // 使い方。文中の `…` は画面が <code> にする
  "help.title": "使い方",
  "help.lead":
    "資料は、手元のエージェント(Claude など)に会話で頼んで作ります。この画面は、できた資料を読み、直し、書き出して配る場所です。ここでは、頼んだあとに何が起きて何ができあがるかを、区分ごとにまとめます。",
  "help.toc": "目次",
  "help.sub.ask": "頼み方",
  "help.sub.agent": "エージェントがすること",
  "help.sub.result": "できあがるもの",
  "help.sub.edit": "画面で直す",
  "help.sub.ai": "AI に直してもらう",
  "help.sub.export": "書き出す",
  "help.sub.share": "共有する",

  "help.flowTitle": "頼んでからできあがるまで",
  "help.flowLead": "スライド・質問票・HTML 資料のどれも、流れは同じです。",
  "help.flow1":
    "どのフォルダの会話でも、エージェントに「〜の資料を作って」と頼みます。エージェントは ai-handout-studio スキルを読んで動きます。",
  "help.flow2":
    "会話から分からないことがあると、作り始める前に質問票の URL が届きます。読み手・枚数・題名や、スクリーンショットと画像生成が要るかを、1回にまとめて聞くものです。テンプレートは聞かれません。",
  "help.flow3": "答え終わったら「回答をコピー」を押し、会話に貼って返します。",
  "help.flow4":
    "エージェントが資料を作り、形の検査に通るまで直してから保存します。",
  "help.flow5":
    "開く URL が返ってきます。パソコンで開く URL と、同じ Wi-Fi のスマートフォンで開く URL です。資料は左のメニューの「資料一覧」にも並びます。",
  "help.tipsTitle": "頼み方のこつ",
  "help.tip1":
    "読み手・長さ・伝えたいことを最初に書くと、質問票は短くなるか、出ずに済みます。「聞かずに作って」「おまかせ」と言えば質問票を出さずに作り、決めたことを最後に伝えます。",
  "help.tip2":
    "テンプレートを選びたいときは、名前で頼みます(例:「Lumen で作って」)。言わなければ既定のテンプレートで作ります。あとから画面で替えることもできます。",
  "help.tip3":
    "数字・金額・日程・固有名詞は、会話や渡した資料にあるものだけが使われます。根拠が無いところには `[[要確認]]` と入るので、画面か会話で埋めます。",
  "help.tip4":
    "できた資料も会話で直せます(例:「さっきのスライドの3枚目を短くして」)。文言の小さな直しは画面のほうが早く済みます。",
  "help.tip5":
    "共有の Wi-Fi にいるときは、そう伝えます。スマートフォン用の URL を出さずに渡します。",

  "help.slideTitle": "スライド",
  "help.slideAsk":
    "「来週の定例で使う提案のスライドを作って」「新人向け勉強会のスライドを10枚で」のように頼みます。登壇・LT・講義で話すためのスライドは「登壇資料を作って」と頼むと、下の「登壇スライド」の作り方になります。",
  "help.slideAgent1":
    "聞き取りの質問票で、目的・読み手・枚数・題名を聞きます。画面の操作が題材ならスクリーンショット、紹介や勉強会なら表紙や挿絵の画像生成が要るかも聞きます。",
  "help.slideAgent2":
    "目的に近い構成(提案・勉強会・自己紹介・キックオフ・登壇)を出発点にして、1枚に1つのメッセージで組みます。",
  "help.slideAgent3":
    "スクリーンショットや絵は、エージェントが撮るか作って資料に入れます。用意できないときは置き場所だけを空け、そのことを伝えます。",
  "help.slideAgent4": "検査に通るまで直してから、開く URL を返します。",
  "help.slideResult":
    "1280x720 のスライドの束です。表紙・中扉・本文・締めのスライドに、見出し・本文・箇条書き・カード・数値・左右の対比・ステップ・表・画像の部品が並びます。色・書体・飾りは既定のテンプレートが当てるので、エージェントは中身だけを書きます。資料一覧のカードを押すと編集画面が開きます。",
  "help.talkTitle": "登壇スライド",
  "help.talkLead":
    "聞き取りに、告知ページの URL・持ち時間・伝えたいことと聞き手が加わります。告知ページがあれば、正式な題や概要はそこから取ります。",
  "help.talk1":
    "書き始める前に、スライドごとの見出しを並べた骨子を会話で相談します。",
  "help.talk2":
    "見た目は登壇用のテンプレート Podium になります。字が大きく、1枚の文字は少なめです。",
  "help.talk3":
    "持ち時間に収まるかを見積もり、文字の多すぎるスライドを直します。",
  "help.talk4":
    "話す言葉は、各スライドの「メモ」に台本として入ります。PPTX に書き出すと発表者ノートになります。",
  "help.slideEditLead":
    "編集画面は、左がスライドの一覧、中央がキャンバス、右が編集パネル(プロパティ・パーツ・AI・JSON)です。",
  "help.slideEdit1":
    "文字はキャンバスでダブルクリックするか、右の「プロパティ」で直します。位置と大きさも右で変えられます。",
  "help.slideEdit2":
    "部品は「パーツ」から足します。スライドの追加・複製・削除・並べ替え(ドラッグ)は左の一覧でします。",
  "help.slideEdit3":
    "「メモ」には口で足すことを書きます。スライドには出ません。",
  "help.slideEdit4": "「はみ出し検査」で、枠からはみ出した文字を探します。",
  "help.slideEdit5":
    "上の「テンプレート: …」を押すと、見た目だけを替えられます。中身は変わりません。",
  "help.slideEdit6":
    "保存は ⌘S です。戻す・進むのほか、「履歴」で保存のたびに残る版(直近30件)に戻せます。",
  "help.slideAi":
    "右の「AI」で、適用先(このスライドかデッキ全体)と指示を書き、「編集案を作成」を押します。「エージェントを起動する」で画面から動かすか、出たコマンドを端末に貼ります。届いた案を確かめて「この案を反映する」を押し、よければ保存します。",
  "help.slideExportLead":
    "編集画面の右上から書き出します。保存してから押します。",
  "help.slideExport1": "PDF: 1スライド1ページ",
  "help.slideExport2": "PNG: 1枚ごとに 1280x720 の画像",
  "help.slideExport3":
    "PPTX: スライドのアプリで開けます。メモは発表者ノートに入ります",
  "help.slideExport4": "HTML: 配るための1枚の HTML",
  "help.slideExportNote":
    "書き出したファイルは、資料のフォルダの `exports/` に入ります。はみ出しがあれば、書き出す前に確かめられます。",
  "help.slideShareNote":
    "共有(URL で人に見せる)は、まだスライドでは使えません。質問票と HTML 資料で先に使えます。",

  "help.sheetTitle": "質問票",
  "help.sheetLead":
    "質問票は、エージェントがあなたに確かめたいことを1枚にまとめて聞くページです。question-sheet スキルが作り、資料として残します。",
  "help.sheetWhenTitle": "出てくる場面",
  "help.sheetWhen1": "資料を頼んだとき、作る前の聞き取りとして出ます。",
  "help.sheetWhen2":
    "「質問票で聞いて」「選択肢を並べて確かめて」と頼んだときや、エージェントが方針や候補を選んでほしいときに出ます。1〜2件の短い確認は、会話だけで済ませることもあります。",
  "help.sheetAgent1":
    "質問ごとに、判断に要る説明・比較表・注意を付けて組みます。選択肢があれば、おすすめの答えを初期値に入れます。",
  "help.sheetAgent2":
    "検査に通してから保存し、答えるページの URL(スマートフォン用も)を返します。",
  "help.sheetResult1":
    "既定は1問ずつ読む形です。広い画面では質問一覧が開いた状態で始まり、進み具合が見えます。「質問一覧を閉じる」で本文を広く読めます。",
  "help.sheetResult2":
    "ほかに、全問を1ページに並べる形と、紙に書き込む印刷向けの形があります。",
  "help.sheetAnswerTitle": "答え方",
  "help.sheetAnswer1":
    "選択肢を選ぶか、欄に書きます。おすすめの答えが入っているので、そのままでよければ次へ進みます。",
  "help.sheetAnswer2": "途中の入力はブラウザに残り、リロードしても消えません。",
  "help.sheetAnswer3":
    "最後の質問まで進むと(全問の形では下の帯に)「回答をコピー」が出ます。押すと回答が Markdown でコピーされるので、会話に貼って返します。画面からサーバーへは送りません。",
  "help.sheetAnswer4":
    "貼った回答は、エージェントが資料に残します。あとで開くと、答えた内容が入った状態で出ます。",
  "help.sheetEditLead": "資料一覧のカードを押すと、1件のページが開きます。",
  "help.sheetEdit1": "テンプレートを替えられます。見本の倍率も選べます。",
  "help.sheetEdit2": "「原寸で開く」で、答えるページを開きます。",
  "help.sheetEdit3":
    "「1枚の HTML に書き出す」(下向きの矢印)で、配れる1つのファイルにします。帯の下の知らせから、保存した場所のパスか、そのフォルダを開くコマンドをコピーできます。コマンドは端末に貼ると、ファイルを選んだ状態でフォルダが開きます(Mac と Windows で形が違い、アプリが動いている PC に合わせて出ます)。",
  "help.sheetEdit4":
    "資料の情報に、レイアウトと、回答が残っているか(回答あり・回答なし)が出ます。",
  "help.sheetEditNote":
    "質問や選択肢、レイアウト(1問ずつ・全問・印刷向け)を替えるときは、会話でエージェントに頼みます。画面では直せません。",
  "help.sheetShare1":
    "URL で人に見せたいときは、会話でエージェントに「この質問票を共有して」と頼みます。エージェントが共有用の束を作り、Claude の Artifact として非公開で公開して URL を返します。公開リンクにするかどうかは、Artifact の画面の Share から自分で選びます。資料に入っている名前(署名など)は、公開リンクにすると誰でも読めます。",
  "help.sheetShare2":
    "あとから資料一覧で見つけた質問票は、1件のページの上の帯の「共有の依頼をコピー」を押します。依頼文がコピーされ、ボタンの下に知らせが出るので、Claude Code の会話に貼ります。`[[要確認]]` が残っているなど気をつけることがあれば、知らせの下に出て、依頼文にも入ります。",
  "help.sheetShare3":
    "公開したあとにページを開き直すと、帯に「共有中」とその URL が出ます。もう一度共有すると、同じ URL が新しい版になります。",
  "help.sheetShare4":
    "共有した相手の回答は、サーバーには届きません。相手が「回答をコピー」で Markdown にして送ってくれたものを、今までどおり会話に貼って返します。共有したページには「ファイルで保存」は出ません。",

  "help.documentTitle": "HTML 資料",
  "help.documentAsk":
    "設計書・要求要件・調査結果・PR の説明・ADR のように、読んでもらう資料は HTML 資料になります。「この調査結果を人に渡す形にして」「設計書を HTML にして」のように頼みます。",
  "help.documentAgent1":
    "聞き取りの質問票で、目的・読み手・題名と、画面の操作が題材ならスクリーンショットが要るかを聞きます。長さと画像生成は聞きません。",
  "help.documentAgent2":
    "読み手を1人に決め、資料の種類に合う型(セクションの並び)を選んで組みます。",
  "help.documentAgent3":
    "検査に通してから保存し、編集画面の URL と、原寸で読むページの URL(スマートフォン用も)を返します。",
  "help.documentResult":
    "縦に読む1枚の HTML です。題と要旨・要約・目次のあとにセクションが続き、中は本文・箇条書き・手順・表・カード・注意・補足・危険・未決・引用・コード・図の部品で組まれます。脇に用語の説明が付くこともあります。原寸のページはスマートフォンの幅でも読めます。",
  "help.documentEditLead":
    "資料一覧のカードを押すと編集画面が開きます。左がセクションとブロック、中央がプレビュー、右が編集パネル(プロパティ・パーツ・AI)です。",
  "help.documentEdit1":
    "セクションとブロックは左で選び、消し、ドラッグで並べ替えます。セクションは左の「セクションを足す」で足します。選んだものの中身は右の「プロパティ」で直します。",
  "help.documentEdit2":
    "部品は右の「パーツ」から、選んだブロックの後ろに足します。",
  "help.documentEdit3":
    "題・要旨・要約・目次・署名・脇の用語・下端の行は、左の「表紙まわり」を選んで直します。",
  "help.documentEdit4":
    "プレビューはいつも画面に合わせて描きます。上の帯のボタンは、マウスを合わせると名前が出ます。右のパネルは畳めます。",
  "help.documentEdit5":
    "上の欄でテンプレートを替えられます。保存のたびに版が残り、「履歴」から戻せます。",
  "help.documentAi":
    "右の「AI」でセクションを1つ選び、指示を書いて「編集案を作成」を押します。出たコマンドを端末に貼ると、エージェントが案を作ります。届いた案は「元 / 案」で見比べ、「この案を取り込む」を押してから保存します。",
  "help.documentExport":
    "編集画面の「1枚の HTML に書き出す」(下向きの矢印)で、CSS を埋め込んだ1つのファイルになります。帯の下の知らせから、保存した場所のパスか、そのフォルダを開くコマンドをコピーできます。コマンドは端末に貼ると、ファイルを選んだ状態でフォルダが開きます。PDF が要るときは、そのファイルをブラウザで開き、印刷から PDF にします。",
  "help.documentShare1":
    "URL で人に見せたいときは、会話でエージェントに「この HTML 資料を共有して」と頼みます。エージェントが共有用の束(1枚の HTML と画像のファイル)を作り、Claude の Artifact として非公開で公開して URL を返します。公開リンクにするかどうかは、Artifact の画面の Share から自分で選びます。",
  "help.documentShare2":
    "画面からは、編集画面の上の帯の「共有の依頼をコピー」を押し、コピーされた依頼文を Claude Code の会話に貼ります。束は保存した中身から作るので、未保存の変更があるときは押せません(書き出しと同じです)。",
  "help.documentShare3":
    "公開したあとに画面を開き直すと、帯に「共有中」とその URL が出ます。もう一度共有すると、同じ URL が新しい版になります。",

  "help.templateTitle": "テンプレート",
  "help.templateLead":
    "色・書体・余白・飾りはテンプレートが持ちます。区分ごとに、左のメニューの「テンプレート」で見本を見比べられます。★ の付いたものが既定で、名前を言わずに頼んだ資料にはこれが当たります。",
  "help.template1":
    "カードにカーソルを合わせると「既定にする」「編集」が出ます。",
  "help.template2":
    "編集で変えられるのは、文字の大きさ(倍率)と、質問票・HTML 資料のレイアウトです。「保存して CSS を作る」で反映します。",
  "help.template3":
    "1本の資料だけ見た目を替えるときは、その資料の画面でテンプレートを選び替えます。資料に書いたテンプレートは、既定より優先されます。",
  "help.template4":
    "どんなテンプレートがあるかは、エージェントに聞けば一覧で答えます。",

  "help.listTitle": "資料一覧と検索",
  "help.list1":
    "資料一覧は区分ごとに、表紙の写真のカードで並びます。カードにカーソルを合わせると、題名と操作(開く・☆・削除)が出ます。削除は取り消せません。",
  "help.list2":
    "☆ を押すとお気に入りになり、一覧の上の「お気に入り」に分かれて並びます。",
  "help.list3": "スライドの資料一覧は、タグで絞り込めます。",
  "help.list4":
    "見出しの右端の虫めがねで、検索の窓が開きます。3区分の資料の題名とテンプレートの名前をまとめて探し、↑↓ で選んで Enter で開きます。Esc で閉じます。",

  "help.phoneTitle": "スマートフォンで読む",
  "help.phoneLead":
    "エージェントは資料を渡すとき、同じ Wi-Fi のスマートフォンで開ける URL も並べます。そのために、アプリをその起動のときだけ LAN に開きます。",
  "help.phone1":
    "質問票と HTML 資料は、原寸のページをそのまま読めます。質問票はスマートフォンで答えて返せます。",
  "help.phone2":
    "スマートフォンでは「回答をコピー」でコピーできないことがあります。そのときは回答の欄が選ばれた状態で出るので、そこからコピーします。",
  "help.phone3":
    "スライドには原寸のページが無く、届くのは編集画面の URL です。編集画面はパソコンの幅に合わせてあります。",
  "help.phone4":
    "LAN に開いている間は、同じネットワークの誰でも資料を読めます。共有の Wi-Fi にいるときは、エージェントにそう伝えてください。",

  "help.filesTitle": "ファイルとコマンド",
  "help.files1":
    "資料は1本ごとに `workspace/<区分>/<資料のid>/` のフォルダに入ります。区分は decks・sheets・documents です。正本はスライドが deck.json、質問票が questions.json、HTML 資料が document.json です。画像は `assets/`、書き出しは `exports/`、共有用の束は `share/` に置きます。",
  "help.files2":
    "ファイルを外から書き換えたときは、画面に戻ると読み直します。保存していない変更があるときは、読み直すか編集を続けるかを選べます。形が正しくないファイルは、理由を出して触れません。",
  "help.files3":
    "エージェントは `ai-handout-studio` コマンドで資料を作り、検査し、保存します。自分でアプリを開くときは、端末で `ai-handout-studio open` を実行します。",

  "help.settingsTitle": "設定",
  "help.settings1":
    "組織名を入れます。スライドの表紙と締め、HTML 資料と質問票の題名の上に出し、資料ごとには持たせません。画面の言語は設定の `locale` で決まります。変えるときは `ai-handout-studio settings --set locale=en` のあと、画面を開き直します。",

  "profile.title": "設定",
  "profile.lead": "資料に出す組織名です。資料ごとには持たせません。",
  "profile.orgName": "組織名",
  "profile.orgHint":
    "スライドの表紙と締め、HTML 資料と質問票の題名の上に小さく出ます。空なら出しません。",
  "profile.saved": "保存しました。資料を開くと反映されます。",
  "profile.saving": "保存中…",
  "profile.save": "保存",

  "design.new.noLabel": "表示名を入れます",
  "design.new.label": "表示名",
  "design.copyOf": "{label}の写し",
  "design.surfacePanel": "{surface}の調整",
  "design.sample.pages": "見本のページ",
  "design.sample.page": "{n} / {total} ページ",
  "design.zoom": "表示の倍率",
  "design.zoom.fit": "画面に合わせる",
  "design.zoom.actual": "100%",
  "design.zoom.zoom": "200%",
  "design.checks.frame": "画面の幅から右へはみ出しています",
  "design.section.textScale": "文字の大きさ",
  "design.textScale.label": "文字の大きさの倍率",
  "design.textScale.value": "{n}%",
  "design.textScale.reset": "100% に戻す",
  "design.textScale.hint":
    "見出しも本文も注記も、同じ割合で大きく・小さくなります。",
  "design.textScale.floor":
    "このテンプレートは最小の字を {px}px と決めているので、{n}% より小さくできません。",
  "design.leaveConfirm":
    "保存していない変更があります。このページを離れますか?",
  "design.saving": "保存中…",
  "design.save": "保存して CSS を作る",
  "design.loadFail": "テンプレートを読み込めません",
  "design.area.main": "本文",
  "design.area.toc": "目次",
  "design.area.aside": "脇",
  "design.sample.slide": "スライド",
  "design.sample.sheet": "質問票",
  "design.sample.document": "文書",
  "design.sample.pending": "見本がありません。pnpm design:build で作ります",
  "design.layout.focus": "1問ずつ",
  "design.layout.overview": "一覧を開く",
  "design.layout.all": "全問",
  "design.layout.print": "印刷向け",
  "design.checks": "保存時の検査",
  "design.checks.overflow": "はみ出し",
  "design.checks.overflowOk": "見本にはみ出しはありません",
  "design.checks.measuring": "測っています…",

  "editor.leaveConfirm":
    "保存していない変更があります。このページを離れますか?",
  "editor.overflowConfirm":
    "はみ出しが {n} 件あります。このまま書き出しますか?",
  "editor.openFail": "資料を開けません",
  "editor.loadFail": "{deckId} を読み込めません",

  "editorBar.undo": "戻す",
  "editorBar.undoTitle": "戻す(⌘Z)",
  "editorBar.redo": "進む",
  "editorBar.redoTitle": "進む(⇧⌘Z)",
  "editorBar.template": "テンプレート: {template}",
  "editorBar.inspect": "はみ出し検査",
  "editorBar.inspecting": "検査中…",
  "editorBar.templateTitle": "テンプレートを選び替える",
  "templateSwitch.title": "テンプレートを選ぶ",
  "templateSwitch.hint":
    "見た目だけが替わります。中身は変わりません。保存すると資料に書き込まれます。",
  "templateSwitch.current": "使用中",
  "templateSwitch.edit": "このテンプレートを直す",
  "templateSwitch.done": "閉じる",
  "templates.backToDeck": "資料に戻る",
  "editorBar.history": "履歴",
  "editorBar.exportDisabled": "保存してから書き出します",
  "editorBar.shareDisabled": "保存してから共有します",
  "editorBar.save": "保存",
  "editorBar.saveTitle": "保存(⌘S)",
  "editorBar.saving": "保存中…",
  "editorBar.dirty": "未保存の変更",
  "editorBar.saved": "保存済み",
  "editorBar.conflict":
    "deck.json が外で書き換えられました。読み直すと、保存していない変更は消えます。",
  "editorBar.saveFail": "保存できませんでした: {message}",
  "editorBar.reload": "ファイルを読み直す",
  "editorBar.keepEditing": "編集を続ける",

  "export.exported": "{format} を書き出しました({n}ファイル)",
  "export.warnings": "はみ出しの警告が {n} 件あります。",
  "export.exporting": "書き出し中…(初回はブラウザの起動に数秒かかります)",
  "export.fail": "書き出せませんでした: {message}",
  "export.closeNotice": "お知らせを閉じる",
  "export.pdf": "PDF を書き出す",

  "history.title": "履歴",
  "history.lead":
    "保存のたびに旧版を残しています(直近30件)。戻したときも、新しい版として残ります。",
  "history.empty": "まだ旧版はありません。",
  "history.sourceGenerated": "生成案",
  "history.sourceSave": "保存",
  "history.unknownDate": "日時不明",
  "history.restoreConfirm":
    "保存していない変更があります。この版に戻すと、その変更は消えます。続けますか?",
  "history.restore": "この版に戻す",
  "history.restoring": "戻しています…",

  "overflow.none": "はみ出しは見つかりませんでした。",
  "overflow.some": "はみ出しが {n} 件あります",
  "overflow.close": "検査の結果を閉じる",

  "json.lead":
    "選んでいるスライドの JSON です。直したら「適用」で検証してから反映します。",
  "json.aria": "スライドの JSON",
  "json.reset": "元に戻す",
  "json.apply": "適用",

  "props.tabs": "編集パネルのタブ",
  "props.collapse": "パネルを畳む",
  "props.expand": "パネルを開く",
  "props.tabProperties": "プロパティ",
  "props.tabParts": "パーツ",
  "props.tabAi": "AI",
  "props.tabJson": "JSON",
  "props.panel": "編集パネル",
  "props.slide": "スライド",
  "props.layout": "レイアウト",
  "props.layoutCover": "表紙",
  "props.layoutSection": "中扉",
  "props.layoutContent": "本文",
  "props.layoutClosing": "締め",
  "props.notes": "メモ",
  "props.notesHint": "口頭で足すことを書きます。スライドには出ません。",
  "props.pickBlockHint":
    "キャンバスでブロックを選ぶと、そのブロックのプロパティを編集できます。",
  "props.deleteBlock": "このブロックを削除",
  "props.deleteTitle": "削除(Delete)",
  "props.rect": "位置と大きさ(px)",
  "props.content": "内容",
  "props.unknownBlock": "未対応のブロックです。JSON タブで直せます。",
  "props.partHint": "選択中のパーツのプロパティを編集できます。",

  "field.kicker": "見出しの上のラベル",
  "field.heading": "見出し",
  "field.size": "大きさ",
  "field.sizeLarge": "大(レベル1)",
  "field.sizeMedium": "中(レベル2)",
  "field.body": "本文",
  "field.align": "揃え",
  "field.alignLeft": "左揃え",
  "field.alignCenter": "中央",
  "field.alignRight": "右揃え",
  "field.items": "項目",
  "field.itemsHint": "1行が1項目です。",
  "field.marker": "印",
  "field.markerDisc": "点",
  "field.markerNumber": "番号",
  "field.columns": "列の数",
  "field.columns2": "2列",
  "field.columns3": "3列",
  "field.columns4": "4列",
  "field.cards": "カード",
  "field.title": "タイトル",
  "field.icon": "アイコン",
  "field.noIcon": "なし",
  "field.figures": "数値",
  "field.value": "値",
  "field.valueHint": "根拠の無い数値は [[要確認]] のままにします。",
  "field.label": "ラベル",
  "field.note": "補足",
  "field.leftColumn": "左の列",
  "field.rightColumn": "右の列",
  "field.steps": "ステップ",
  "field.headers": "列の見出し",
  "field.headersHint": "「|」で区切ります。",
  "field.rows": "行",
  "field.rowsHint": "1行が表の1行です。セルは「|」で区切ります。",
  "field.imageSrc": "画像のパス",
  "field.imageSrcHint": "資料フォルダの assets/ からの相対パスです。",
  "field.fit": "収め方",
  "field.fitCover": "枠いっぱいに切り抜く",
  "field.fitContain": "全体を収める",
  "field.caption": "キャプション",
  "field.showPage": "ページ番号を出す",
  "field.deleteItem": "{label}の{index}番目を削除",
  "field.addItem": "{label}を追加",

  "part.heading.label": "見出し",
  "part.heading.note": "1枚のメッセージ",
  "part.text.label": "本文",
  "part.text.note": "補足の文章",
  "part.bullets.label": "箇条書き",
  "part.bullets.note": "並列の要点",
  "part.card-grid.label": "カード列",
  "part.card-grid.note": "並列の概念を2〜4個",
  "part.kpi-row.label": "数値タイル",
  "part.kpi-row.note": "指標の数値",
  "part.two-col.label": "左右の対比",
  "part.two-col.note": "現状と目標など",
  "part.process.label": "ステップ",
  "part.process.note": "順番のある手順",
  "part.table.label": "表",
  "part.table.note": "行と列で比べる",
  "part.image.label": "画像",
  "part.image.note": "assets/ の画像",
  "part.footer.label": "フッター",
  "part.footer.note": "ページ番号",
  "parts.hint": "押すと、選んでいるスライドの中央に追加します。",

  // HTML 資料の編集画面
  "doc.backToList": "HTML 資料一覧",
  "doc.outline": "セクションとブロック",
  "doc.front": "表紙まわり",
  "doc.frontHint":
    "セクションに属さない部分です。置き場所はテンプレートが決めます。",
  "doc.noHeading": "(見出しなし)",
  "doc.addSection": "セクションを足す",
  "doc.sectionDrag": "{n} 番目のセクションを並べ替える",
  "doc.sectionDelete": "セクションを削除",
  "doc.blockDrag": "{n} 番目のブロックを並べ替える",
  "doc.blockDelete": "ブロックを削除",
  "doc.section": "セクション",
  "doc.sectionHeading": "見出し",
  "doc.level": "深さ",
  "doc.level2": "セクション(h2)",
  "doc.level3": "小見出し(h3)",
  "doc.levelHint": "小見出しは直前のセクションの中に入り、目次には出ません。",
  "doc.pickBlockHint": "左でブロックを選ぶと、ここで中身を直せます。",
  "doc.partsHint": "押すと、選んでいるブロックの後ろに足します。",
  "docai.tab": "AI",
  "docai.lead":
    "セクションを1つ選び、直したいことを書きます。案は取り込む前にプレビューで見比べられます。",
  "docai.needSection": "先に左でセクションかブロックを選んでください。",
  "docai.target": "対象のセクション",
  "docai.instruction": "指示",
  "docai.instructionPlaceholder": "例: 箇条書きを表にして、重複を減らす",
  "docai.create": "編集案を作成",
  "docai.creating": "作成中…",
  "docai.handoffBefore": "エージェントで ",
  "docai.handoffAfter": " を書くと、ここに案が出ます。",
  "docai.waiting": "編集案を待っています(3秒ごとに確認します)",
  "docai.invalid": "編集案が検査に通りません。直すとここに出ます。",
  "docai.ready": "編集案が届きました(セクション {section})",
  "docai.viewBefore": "元",
  "docai.viewAfter": "案",
  "docai.comparing": "見比べ中: {view}(保存前の内容を含みます)",
  "docai.changedWarn":
    "依頼したあとに、このセクションを直しています。取り込むと案で置き換わります。",
  "docai.apply": "この案を取り込む",
  "docai.applyNote":
    "取り込みは下書きに入ります。保存すると版が積まれ、元に戻すで取り消せます。",
  "docai.cancel": "この依頼をやめる",
  "doc.partsNeedSection": "先に左でセクションを選んでください。",
  "doc.previewStale": "保存すると、このプレビューが今の中身に変わります。",
  "doc.conflict":
    "document.json が外で書き換えられました。読み直すと、保存していない変更は消えます。",
  "doc.head": "題",
  "doc.headTitle": "資料の題",
  "doc.headLede": "要旨",
  "doc.headLedeHint": "題の下に出る1〜2行です。",
  "doc.summary": "要約",
  "doc.useSummary": "要約を出す",
  "doc.summaryLabelHint": "空なら「要約」と出ます。",
  "doc.toc": "目次",
  "doc.tocLabel": "目次の出し方",
  "doc.tocAuto": "セクションの見出しから作る",
  "doc.tocNone": "出さない",
  "doc.signature": "上端の署名",
  "doc.useSignature": "上端の署名を出す",
  "doc.org": "組織名",
  "doc.signatureNote": "添える一行",
  "doc.signatureNoteHint": "資料の種類と日付など。",
  "doc.signatureOrgHint": "空なら設定の組織名を出します。",
  "doc.aside": "脇の用語",
  "doc.useAside": "脇の用語を出す",
  "doc.glossary": "用語",
  "doc.term": "語",
  "doc.termDescription": "説明",
  "doc.foot": "下端の行",
  "doc.useFoot": "下端の行を出す",
  "doc.field.textHint": "空行を挟まずに改行すると、段落が分かれます。",
  "doc.field.why": "理由",
  "doc.field.whyHint": "手順の下に小さく出ます。空なら出ません。",
  "doc.field.rowLabel": "先頭の列を行見出しにする",
  "doc.field.numeric": "数値の列",
  "doc.field.numericHint": "右へ寄せる列を、0 から数えた番号で並べます。",
  "doc.field.kind": "種類",
  "doc.field.kindInfo": "情報",
  "doc.field.kindSuccess": "成功",
  "doc.field.kindWarning": "注意",
  "doc.field.noticeLabelHint": "空なら種類の名前が出ます。",
  "doc.field.source": "出典",
  "doc.field.code": "コード",
  "doc.field.figureHtml": "図の中身",
  "doc.field.figureHtmlHint":
    "図の生成器が出した中身です。class は ds- で始まるものだけ使えます。",
  "doc.field.alt": "代替テキスト",
  "doc.field.altHint": "画像が読めないときと読み上げで使う説明です。",
  "doc.field.imageSrc":
    "ファイル: {src}。画像の追加と差し替えは、エージェントに頼みます。",
  "doc.field.html": "HTML",
  "doc.field.htmlHint":
    "移行と例外の受け皿です。class は ds- で始まるものだけ使えます。",
  "doc.part.text.label": "本文",
  "doc.part.text.note": "段落の文章",
  "doc.part.bullets.label": "箇条書き",
  "doc.part.bullets.note": "並列の項目",
  "doc.part.ordered.label": "手順",
  "doc.part.ordered.note": "順番のある項目",
  "doc.part.table.label": "表",
  "doc.part.table.note": "行と列で比べる",
  "doc.part.cards.label": "カード",
  "doc.part.cards.note": "並列の概念を2〜3枚",
  "doc.part.notice.label": "注意",
  "doc.part.notice.note": "読み落とすと困る条件",
  "doc.part.note.label": "補足",
  "doc.part.note.note": "本筋の外の一言",
  "doc.part.alert.label": "危険",
  "doc.part.alert.note": "壊れることの警告",
  "doc.part.open.label": "未決",
  "doc.part.open.note": "まだ決まっていないこと",
  "doc.part.quote.label": "引用",
  "doc.part.quote.note": "出典のある文",
  "doc.part.code.label": "コード",
  "doc.part.code.note": "コマンドや設定",
  "doc.part.figure.label": "図",
  "doc.part.figure.note": "図の生成器の出力",
  "doc.part.image.label": "画像",
  "doc.part.image.note": "スクリーンショットや生成した絵",
  "doc.part.html.label": "HTML",
  "doc.part.html.note": "移行と例外の受け皿",

  "slides.list": "スライド一覧",
  "slides.head": "スライド",
  "slides.select": "スライド {n} を選ぶ",
  "slides.ops": "スライド {n} の操作",
  "slides.duplicate": "複製",
  "slides.drag": "スライド {n} を並べ替える",
  "slides.delete": "削除",
  "slides.add": "スライドを追加",

  "canvas.stage": "選択中のスライド",
  "canvas.zoom": "表示の倍率",
  "canvas.fit": "フィット",
  "canvas.editText": "文言を編集(Esc で取り消し)",
  "canvas.block": "{type} ブロック {id}",

  "side.width": "サイドバーの幅",

  "dialog.close": "閉じる",

  "ai.title": "AIと、一枚を仕上げる",
  "ai.lead": "伝えたい変更を入力。提案を確認してから反映できます。",
  "ai.scope": "適用先",
  "ai.scopeSlide": "このスライド",
  "ai.scopeDeck": "デッキ全体",
  "ai.instruction": "指示",
  "ai.instructionPlaceholder":
    "例: 見出しを短くして、意味を損なわずにすっきりさせる",
  "ai.quickShort": "文章を短く",
  "ai.quickVisual": "図で伝わる構成に",
  "ai.quickLayout": "余白と配置を整える",
  "ai.creating": "作成中…",
  "ai.create": "編集案を作成",
  "ai.handoffBefore":
    "パネルから直接起動するか、ターミナルで次のコマンドを実行します。エージェントが ",
  "ai.handoffAfter": " を書くと、ここに案が出ます。",
  "ai.waiting": "編集案を待っています(3秒ごとに確認します)",
  "ai.invalid":
    "編集案が検証に通りません。直してもらうと、ここに反映されます。",
  "ai.ready": "編集案が届きました({slides})",
  "ai.changedWarn":
    "依頼したときから、この内容を直しています。反映すると、依頼時の案で置き換わります。",
  "ai.apply": "この案を反映する",
  "ai.noSaveNote": "反映しても保存はしません。戻すで取り消せます。",
  "ai.cancelRequest": "この依頼をやめる",

  "commandBox.agentLegend": "使うエージェント",

  "run.agentLegend": "起動するエージェント",
  "run.confirmBefore": "対象は{target}。書き出し先は ",
  "run.confirmAfter": " で、deck.json を直接変えることはありません。",
  "run.starting": "起動しています…",
  "run.launch": "エージェントを起動する",
  "run.running": "エージェントが実行中です({time})",
  "run.stopping": "停止しています…",
  "run.stop": "停止する",
  "run.done": "エージェントが終わりました。下の案を確認してください。",
  "run.cancelled": "停止しました。",
  "run.failed": "失敗しました。",
  "run.retry": "もう一度起動する",
  "run.targetSlide": "このスライド({id})",
  "run.targetDeck": "デッキ全体",

  "templates.title.slide": "スライドのテンプレート",
  "templates.title.sheet": "質問票のテンプレート",
  "templates.title.document": "HTML 資料のテンプレート",
  "templates.lead.slide":
    "カードにカーソルを合わせると、名前と「既定にする」「編集」が出ます。★ が付いているのが既定です。エージェントに頼むときにテンプレートの名前を添えると(例:「Lumen で作って」)、そのテンプレートでスライドを作ります。言わなければ既定のテンプレートで作ります。",
  "templates.lead.sheet":
    "カードにカーソルを合わせると、名前と「既定にする」「編集」が出ます。★ が付いているのが既定です。エージェントに頼むときにテンプレートの名前を添えると、そのテンプレートで質問票を作ります。言わなければ既定のテンプレートで作ります。",
  "templates.lead.document":
    "カードにカーソルを合わせると、名前と「既定にする」「編集」が出ます。★ が付いているのが既定です。エージェントに頼むときにテンプレートの名前を添えると、そのテンプレートで HTML 資料を作ります。言わなければ既定のテンプレートで作ります。",
  "templates.isDefault": "既定",
  "templates.makeDefault": "既定にする",
  "templates.makeDefaultNamed": "{label}を既定にする",
  "templates.edit": "編集",
  "templates.editNamed": "{label}を編集",
  "design.back": "戻る",
  "design.section.layout": "レイアウト",
  "design.skeleton.hint.sheet":
    "1問ずつは質問一覧が開いた状態で始まります。見本の「質問一覧を閉じる」「質問一覧を開く」を押すと、実際に開閉します。",
  "design.skeleton.hint.document":
    "縮図のカードから本文・目次・脇のレイアウトを選びます。",
  "design.skeleton.base": "レイアウト",
  "design.skeleton.listSide": "一覧の位置",
  "design.skeleton.side.left": "左",
  "design.skeleton.side.right": "右",
  "design.skeleton.printCurrent":
    "今のレイアウトは「印刷向け」です。1問ずつか全問を選ぶと切り替わります。",
  "design.skeleton.document": "並び",
  "design.skeleton.document.standard": "標準(目次は上、脇は右)",
  "design.skeleton.document.single": "1列",
  "design.skeleton.document.side-toc": "目次を左に",
  "design.skeleton.document.current": "今の並び",
  "handouts.id": "ID",
  "handouts.questions": "問数",
  "handouts.answers": "回答",
  "handouts.notAnswered": "回答なし",
  "handouts.createdAt": "作成日時",
  "handouts.updatedAt": "更新日時",
  "handouts.slideCount": "枚数",
  "handouts.status": "状態",
  "handouts.info": "資料の情報",
} as const;

export type MessageKey = keyof typeof ja;
