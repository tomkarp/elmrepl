 <script>

        getCompletionItemsTimeoutMilliseconds = 2000;
        getHoverTimeoutMilliseconds = 1500;
        provideCompletionItemsEventFromElm = function () { };
        provideHoverEventFromElm = function () { };

        function getEditorModel() {
            if (typeof monaco != "object")
                return null;

            return monaco?.editor?.getModels()[0];
        }

        function monacoEditorSetValue(newValue) {
            getEditorModel()?.setValue(newValue);
        }

        function monacoEditorSetModelMarkers(markers) {
            if (typeof monaco === 'undefined')
                return;

            monaco?.editor?.setModelMarkers(getEditorModel(), "", markers.map(monacoMarkerFromElmMonacoMarker));
        }

        function monacoEditorRevealPositionInCenter(position) {
            if (typeof theEditor === 'undefined')
                return;

            theEditor?.revealPositionInCenter(position);
        }

        function monacoMarkerFromElmMonacoMarker(elmMonacoMarker) {
            return {
                message: elmMonacoMarker.message,
                startLineNumber: elmMonacoMarker.startLineNumber,
                startColumn: elmMonacoMarker.startColumn,
                endLineNumber: elmMonacoMarker.endLineNumber,
                endColumn: elmMonacoMarker.endColumn,
                severity: monacoMarkerSeverityFromElmMonacoMarkerSeverity(elmMonacoMarker.severity),
            };
        }

        function monacoMarkerSeverityFromElmMonacoMarkerSeverity(elmMonacoMarkerSeverity) {
            if (typeof monaco === 'undefined')
                return -1;

            if (elmMonacoMarkerSeverity.ErrorSeverity != null)
                return monaco?.MarkerSeverity.Error;

            if (elmMonacoMarkerSeverity.WarningSeverity != null)
                return monaco?.MarkerSeverity.Warning;

            if (elmMonacoMarkerSeverity.InfoSeverity != null)
                return monaco?.MarkerSeverity.Info;

            if (elmMonacoMarkerSeverity.HintSeverity != null)
                return monaco?.MarkerSeverity.Hint;
        }

        function monacoCompletionItemFromElmMonacoCompletionItem(range, completionItem) {
            return {
                label: completionItem.label,
                kind: monacoCompletionItemKindFromElmCompletionItemKind(completionItem.kind),

                // https://github.com/microsoft/monaco-editor/issues/1074#issuecomment-423956977
                documentation: { value: completionItem.documentation },

                insertText: completionItem.insertText,
                range: range
            };
        }

        function monacoCompletionItemKindFromElmCompletionItemKind(completionItemKind) {
            if (typeof monaco === 'undefined')
                return -1;

            if (completionItemKind.ConstructorCompletionItemKind != null)
                return monaco?.languages.CompletionItemKind.Constructor;

            if (completionItemKind.EnumCompletionItemKind != null)
                return monaco?.languages.CompletionItemKind.Enum;

            if (completionItemKind.EnumMemberCompletionItemKind != null)
                return monaco?.languages.CompletionItemKind.EnumMember;

            if (completionItemKind.FunctionCompletionItemKind != null)
                return monaco?.languages.CompletionItemKind.Function;

            if (completionItemKind.ModuleCompletionItemKind != null)
                return monaco?.languages.CompletionItemKind.Module;

            if (completionItemKind.StructCompletionItemKind != null)
                return monaco?.languages.CompletionItemKind.Struct;

            console.error("Unexpected shape of completionItemKind: " + JSON.stringify(completionItemKind));
        }

        function dispatchMessage(message) {
            if (message.SetValue)
                monacoEditorSetValue(message.SetValue[0]);

            if (message.SetModelMarkers)
                monacoEditorSetModelMarkers(message.SetModelMarkers[0]);

            if (message.RevealPositionInCenter)
                monacoEditorRevealPositionInCenter(message.RevealPositionInCenter[0]);

            if (message.ProvideCompletionItemsEvent)
                provideCompletionItemsEventFromElm(message.ProvideCompletionItemsEvent[0]);

            if (message.ProvideHoverEvent)
                provideHoverEventFromElm(message.ProvideHoverEvent[0]);
        }

        function tryCompleteSetup() {
            var editorModel = getEditorModel();

            if (editorModel == null) {
                setTimeout(tryCompleteSetup, 500);
            }
            else {
                editorModel.onDidChangeContent(function () {
                    var content = getEditorModel().getValue();

                    // console.log("onDidChangeContent:\n" + content);

                    parent?.messageFromMonacoFrame?.({ "DidChangeContentEvent": [content] });
                });

                parent?.messageFromMonacoFrame?.({ "CompletedSetupEvent": [] });
            }
        }

        function editorEventOnDidFocusEditorWidget() {
            parent?.messageFromMonacoFrame?.({ "DidFocusEditorWidgetEvent": [] });
        }

        function editorActionCloseEditor() {
            parent?.messageFromMonacoFrame?.({ "EditorActionCloseEditorEvent": [] });
        }

        function editorActionFormatDocument() {
            parent?.messageFromMonacoFrame?.({ "EditorActionFormatDocumentEvent": [] });
        }

        function editorActionCompile() {
            parent?.messageFromMonacoFrame?.({ "EditorActionCompileEvent": [] });
        }

        function editorActionInspectSyntax() {
            parent?.messageFromMonacoFrame?.({ "EditorActionInspectSyntaxEvent": [] });
        }

        function editorProvideCompletionItemsFromRangeAndLeadingText(range, textUntilPosition, cursorLineNumber) {

            return new Promise(function (resolve, reject) {

                var timeout =
                    setTimeout(() => {
                        var message = "Did not get completion items from Elm within " + getCompletionItemsTimeoutMilliseconds + " milliseconds.";

                        console.error(message);
                        reject(message);
                        return;
                    }, getCompletionItemsTimeoutMilliseconds);

                provideCompletionItemsEventFromElm = function (completionItemsFromElm) {
                    clearTimeout(timeout);

                    var completionItemsForMonaco =
                        completionItemsFromElm.map(item => monacoCompletionItemFromElmMonacoCompletionItem(range, item));

                    resolve({ suggestions: completionItemsForMonaco ?? [] });

                    provideCompletionItemsEventFromElm = function () { };
                }

                parent?.messageFromMonacoFrame?.({
                    "RequestCompletionItemsEvent":
                        [{ "textUntilPosition": textUntilPosition, "cursorLineNumber": cursorLineNumber }]
                });
            });
        }

        function editorProvideHoverFromPosition(position, lineText, word) {

            return new Promise(function (resolve, reject) {

                var timeout =
                    setTimeout(() => {
                        var message = "Did not get hover from Elm within " + getHoverTimeoutMilliseconds + " milliseconds.";

                        console.error(message);
                        reject(message);
                    }, getHoverTimeoutMilliseconds);

                provideHoverEventFromElm = function (hoverFromElm) {
                    clearTimeout(timeout);

                    var contents = hoverFromElm.map(content => ({ value: content }));

                    resolve({ contents: contents ?? [] });

                    provideHoverEventFromElm = function () { };
                }

                parent?.messageFromMonacoFrame?.({
                    "RequestHoverEvent":
                        [{
                            "positionLineNumber": position.lineNumber,
                            "positionColumn": position.column,
                            "lineText": lineText,
                            "word": word.word
                        }]
                });
            });
        }


    </script>
