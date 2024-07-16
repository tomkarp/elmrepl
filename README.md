# Online Elm REPL
## Why

If you want to learn or teach Elm, it is often useful to be able to enter and test small Elm programs in an online editor without having to create an Elm project and open a full blown IDE. Especially in schools, you often don't have the possibility to install arbitrary software or open the terminal. Additionally, it can be useful to share Elm programs via a link. The online REPL for Elm offers all of this.

## Required software

You need *npm* and *docker* on your server. If you want to expose your server to the world, a reverse proxy is useful. I use https://caddyserver.com, because it't configuration is very nice. All you need is a Caddyfile with e.g. this content:

```
:80 {
        redir https://elmrepl.de
}

elmrepl.de {
        reverse_proxy localhost:3000
}
```

If you want to have more control of your Nodejs-Sever, *pm2* is useful.

## Configuration

### Swap-file
For each user a docker container is started. Docker containers require significant RAM, hence a 32G swap file is useful, if your server doesn't have plenty of RAM. This can be done with the following commands:

```
sudo dd if=/dev/zero of=/swapfile bs=1M count=32786
mkswap /swapfile
chmod 0600 /swapfile
swapon /swapfile
```

To use the swap-file after reboot, add this to `/etc/fstab`
```
/swapfile    none    swap    sw      0 0
```

### Install and start sever

Clone the repo:
```
git clone http://github.com/tomkarp/elmrepl
```

change to `elmrepl/docker` and build the image:
```
cd elmrepl/docker
docker build -t elm-repl .
```

change to `elmrepl`directory and install node modules:
```
npm install
```

You can start the server with `node src/app.js`. If your server should start after reboot and you are using pm2, you can edit crontab ( `crontab -e`):
```
@reboot sudo pm2 start /pathtoyourelmrepl/elmrepl/src/app.js --name elmrepl
```

### Delete old docker containers

Sometimes docker containers where not removed properly. Also, it can be useful to limit the time for a connection. One way to do this, is to add this to crontab (removes docker containers older than 2 hours):

```
5 * * * * sudo docker ps --filter "ancestor=elm-repl" --format "{{.ID}} {{.Names}} {{.RunningFor}}" | awk '/hours/ && $3 > 2 { print $1 }' | while read -r container_id; do   docker kill "$container_id";  done
```

## Usage

The main usage should be quite obvious. Just type your Elm code in the editor and use it the REPL.
If you want to share the code, you can press the button on the lower right. It generates a link, that contains your compressed Elm-program. The program is not saved on the server, but only contained in the link.

If you want you can use the URL parameters:

`repl` - adds some text to the REPL

`code` - adds an elm program to the editor. Normally using the compressed version is better.

In both cases you have to encode text for example in an online URL encoder.

Here, you can find an example:

https://elmrepl.de?code=%0Asum%20n%20%3D%0A%20%20%20%20if%20n%20%3D%3D%201%20then%201%0A%20%20%20%20else%20n%20%2B%20sum%20%28n%20-%201%29&repl=sum%2010

## Created by
https://github.com/leon-th
