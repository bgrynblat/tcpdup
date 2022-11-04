import { Socket, listen } from "bun";

import {
    PORT,
    RX_TIMEOUT_MS,
    forwards,
    DEBUG
} from "./common"

const sockets = new Map<string, {socket: Socket<string>, timeout: number | NodeJS.Timeout | undefined}>()

const startTimeout = (id:string, socket:Socket<string>) => {
    let timeout
    if(RX_TIMEOUT_MS > 0)
        timeout = setTimeout(() => socket.end(), RX_TIMEOUT_MS)
    sockets.set(id, {socket, timeout})
}

const cancelTimeout = (id:string) => {
    const s = sockets.get(id)
    if(s && s.timeout) clearTimeout(s.timeout)
}

const forward = (hostname: string, port: number, data:BufferSource, onMessage?:(message:BufferSource) => void):Promise<void> => {
    return new Promise((res, rej) => {
        // console.log(`Forwarding to ${hostname}:${port}`)
        Bun.connect({
            hostname,
            port,
            socket: {
                open(socket) {
                    const id = "tx_"+Date.now()+"_"+Math.floor(Math.random()*1000)
                    DEBUG && console.log(`${id}: Connected to ${hostname}:${port}`)
                    socket.data = id
                    socket.write(data)
                    if(!onMessage)  socket.end() // Shut down right away if we don't forward the response back
                    else    startTimeout(socket.data, socket)
                },
                data(socket, message) {
                    startTimeout(socket.data, socket)
                    DEBUG && console.log(`${socket.data}: Received data ${Buffer.from(message as ArrayBuffer)}`)
                    onMessage && onMessage(message)
                    socket.end()
                },
                drain(socket) {},
                close(socket) {
                    DEBUG && console.log(`${socket.data}: Closing socket`);
                    cancelTimeout(socket.data)
                    res()
                },
            },
        
            data: ""
        });
    })
}

const server = listen({
    hostname: "0.0.0.0",
    port: PORT,
    socket: {
        open(socket) {
            const id = "rx_"+Date.now()+"_"+Math.floor(Math.random()*1000)
            socket.data = id
            DEBUG && console.log(`${id}: Socket opened`)
            startTimeout(id, socket)
        },
        data(socket, data) {
            cancelTimeout(socket.data)
            const view = Buffer.from(data as ArrayBuffer);
            DEBUG && console.log(`${socket.data}: Received data ${view}`)

            const promises = forwards.map((f, i) => {
                const onMessage = (message:BufferSource) => {
                    const v = Buffer.from(message as ArrayBuffer);
                    DEBUG && console.log(`${socket.data}: Forwarding data back from ${f.hostname}:${f.port}: ${v}`)
                    socket.write(message)
                    socket.end()
                }

                return forward(f.hostname, f.port, data, !i ? onMessage : undefined)
            })

            startTimeout(socket.data, socket)
        },
        drain(socket) {
            cancelTimeout(socket.data)
            DEBUG && console.log(`${socket.data}: Socket drained`)
        },
        close(socket) {
            cancelTimeout(socket.data)
            DEBUG && console.log(`${socket.data}: Socket closed`)
        },
        error(socket, error) {
            console.error(`${socket.data}: Socket error: ${error}`)
        },
    },
    data: ""
});