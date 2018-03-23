## Option "pipelining"

With traditional synchronous drivers, queries are send one by one, waiting for result before sending next one.
Communication with server following a request–response messaging pattern.

That is not very effective when having to request many query at the same time.
Node.js is efficient because of asynchrone concept, let's follow this rules.

Pipelining is "optimistic send": Connector will send queries one after another, preserving FIFO order. 
This is particularly efficient when client is distant from server.

#### Example :
create a basket with 3 items

```javascript
connection.beginTransaction();
connection.query("INSERT INTO BASKET(customerId) values (?)", [1], (err, res) => {
  //must handle error if any
  const basketId = res.insertId;
  try {
    connection.query("INSERT INTO BASKET_ITEM(basketId, itemId) values (?, ?)", [basketId, 100]);
    connection.query("INSERT INTO BASKET_ITEM(basketId, itemId) values (?, ?)", [basketId, 101]);
    connection.query("INSERT INTO BASKET_ITEM(basketId, itemId) values (?, ?)", [basketId, 102], (err) => {
      //must handle error if any
      connection.commit();
    });
  } catch (err) {
    connection.rollback();
    //handle error
  }
});
```
#### Network exchanges :
<p align="center">
    <img src="./misc/pipelining.png">
</p>


Using standard client-server protocol (aka "ping-pong"), driver communicate with database following a request–response messaging pattern.
When sending a command, connector won't send any until response is available from input socket.

Using option "pipelining", commands are send by bulk, saving network latency.
The Inconvenient is that if an error occur on first/second command, following command are already send to database.
In that sense that pipelining is "optimistic". 

