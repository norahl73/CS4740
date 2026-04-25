import threading
import socket
import signal
import sys
from codecarbon import EmissionsTracker

host = '127.0.0.1'  # local_host
port = 55555

server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
server.bind((host, port))
server.listen()
server.settimeout(1.0)
clients = []
nicknames = []

tracker = EmissionsTracker(measure_power_secs=60, output_file="emissions_from_socket.csv")
tracker.start()


def shutdown_soft(signal, frame):
    print("Shutting down and Saving Data")
    tracker.stop()
    server.close()
    sys.exit(0)


signal.signal(signal.SIGINT, shutdown_soft)
signal.signal(signal.SIGTERM, shutdown_soft)


def broadcast(message):
    for client in clients:
        client.send(message)


def handle(client):
    while True:
        try:
            message = client.recv(1024)
            broadcast(message)
        except:
            index = clients.index(client)
            clients.remove(client)
            client.close()
            nickname = nicknames[index]
            broadcast(f'{nickname} has left the chat'.encode("ascii"))
            nicknames.remove(index)
            break


def receive():
    while True:
        try:
            client, address = server.accept()
            print(f'Connected with {str(address)}')
            client.send('CHRIS'.encode('ascii'))
            nickname = client.recv(1024).decode('ascii')
            nicknames.append(nickname)
            clients.append(client)
            print(f'Nickname of the client is {nickname}!')
            broadcast(f'{nickname} joined the chat!'.encode('ascii'))
            client.send('Connected to the server!'.encode('ascii'))
            thread = threading.Thread(target=handle, args=(client,))
            thread.start()
        except socket.timeout:
            continue
        except Exception as e:
            print(f"Error: {e}")
            break


print("Server Up!")
receive()
