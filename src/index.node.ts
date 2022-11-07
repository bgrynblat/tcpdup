import {Socket, createServer} from "net"
import process from "process"
import {
    PORT,
    RX_TIMEOUT_MS,
    forwards,
    DEBUG
} from "./common"

class TCPSocket extends Socket {
    declare id:string
}

const sockets = new Map<string, {socket: Socket, timeout: NodeJS.Timeout | undefined}>()

const startTimeout = (id:string, socket: Socket) => {
    let timeout
    if(RX_TIMEOUT_MS > 0)
        timeout = setTimeout(() => socket.destroy(), RX_TIMEOUT_MS)
    sockets.set(id, {socket, timeout})
}

const cancelTimeout = (id:string) => {
    const s = sockets.get(id)
    if(s && s.timeout) clearTimeout(s.timeout)
}

const forward = (hostname: string, port: number, data:Buffer, onMessage?:(message:Buffer) => void):Promise<void> => {
    return new Promise((res, rej) => {
        // console.log(`Forwarding to ${hostname}:${port}`)
        const socket = new TCPSocket()
        socket.id = "tx_"+Date.now()+"_"+Math.floor(Math.random()*1000)
        startTimeout(socket.id, socket) // Connection timeout

        socket.connect(port, hostname, () => {
            DEBUG && console.log(`${socket.id}: Connected to ${hostname}:${port}`)
            cancelTimeout(socket.id)
            socket.write(data)
            if(!onMessage)  socket.destroy() // Shut down right away if we don't forward the response back
            else    startTimeout(socket.id, socket)
        })
        socket.on("data", (message) => {
            startTimeout(socket.id, socket)
            DEBUG && console.log(`${socket.id}: Received data ${message.toString()}`)
            onMessage && onMessage(message)
            socket.destroy()
        })
        socket.on("close", () => {
            DEBUG && console.log(`${socket.id}: Closing socket`);
            cancelTimeout(socket.id)
            res()
        })
        socket.on("error", (err) => {
            console.error(`${socket.id}: ERROR`, err.message)
            cancelTimeout(socket.id)
            rej(err)
        })
    })
}

const server = createServer()
.listen(PORT)
.on("connection", (socket: TCPSocket) => {
    const id = "rx_"+Date.now()+"_"+Math.floor(Math.random()*1000)
    socket.id = id

    socket.on("data", (data:Buffer) => {
        cancelTimeout(socket.id)
        DEBUG && console.log(`${socket.id}: Received data ${data.toString()}`)
    
        const promises = forwards.map((f, i) => {
            const onMessage = (message:Buffer) => {
                DEBUG && console.log(`${socket.id}: Forwarding data back from ${f.hostname}:${f.port}: ${message.toString()}`)
                socket.write(message)
                socket.destroy()
            }
    
            return forward(f.hostname, f.port, data, !i ? onMessage : undefined)
            .catch(err => {
                // DO NOTHING
            })
        })
    
        startTimeout(socket.id, socket)
    })

    socket.on("close", (e) => {
        cancelTimeout(socket.id)
        DEBUG && console.log(`${socket.id}: Socket closed`, e)
    })

    socket.on("error", (err) => {
        console.error(`${socket.id}: ERROR`, err.message)
        cancelTimeout(socket.id)
    })

    DEBUG && console.log(`${id}: Socket opened`)
    startTimeout(id, socket)
})

server.on('error', (err:Error) => {
    console.error("Error", err.message)
})

function signalHandler() {
    // Clean exit
    process.exit()
}

//@ts-ignore
process.on('SIGINT', signalHandler)
//@ts-ignore
process.on('SIGTERM', signalHandler)
//@ts-ignore
process.on('SIGQUIT', signalHandler)