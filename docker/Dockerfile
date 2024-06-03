FROM alpine
RUN apk --update add openssl wget gzip 
RUN wget https://github.com/elm/compiler/releases/download/0.19.1/binary-for-linux-64-bit.gz
RUN gunzip binary-for-linux-64-bit.gz && mv binary-for-linux-64-bit /bin/elm
RUN chmod +x /bin/elm

FROM alpine
COPY --from=0 /bin/elm /bin/elm
RUN chmod +x /bin/elm
RUN apk add --no-cache nodejs
# hack to download elm package list and init
RUN (sleep 5 && echo '"Hello World"') | elm repl
RUN echo "Y" | elm init
CMD ["/bin/elm", "repl"]