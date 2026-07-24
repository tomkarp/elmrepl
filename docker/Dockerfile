FROM alpine
ARG ELM_VERSION=0.19.2
RUN apk --update add openssl wget gzip
RUN wget -O elm.gz https://github.com/elm/compiler/releases/download/${ELM_VERSION}/elm-${ELM_VERSION}-linux-x64.gz
RUN gunzip -c elm.gz > /bin/elm
RUN chmod +x /bin/elm

FROM alpine
COPY --from=0 /bin/elm /bin/elm
RUN chmod +x /bin/elm
RUN apk add --no-cache nodejs npm
RUN npm install -g elm-format@0.8.7
# hack to download elm package list and init
RUN (sleep 5 && echo '"Hello World"') | elm repl
RUN echo "Y" | elm init
RUN echo "Y" | elm install elm/random
RUN echo "Y" | elm install elm/json
RUN echo "Y" | elm install elm/svg
CMD ["/bin/elm", "repl"]
