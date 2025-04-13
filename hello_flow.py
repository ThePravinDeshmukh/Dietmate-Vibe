from prefect import flow, task

@task
def say_hello(name):
    return f"Hello, {name}!"

@flow
def hello_flow(name: str = "world"):
    message = say_hello(name)
    print(message)

if __name__ == "__main__":
    hello_flow()