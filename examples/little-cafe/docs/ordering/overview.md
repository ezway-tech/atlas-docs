---
title: The ordering app
description: A tiny example system for the same café.
order: 1
---

## What it does
The app lists drinks, creates an order, and tracks it from `queued` to `preparing` to `ready`. Payment processing is outside this demo.

## Files to explore
- [OpenAPI](openapi.yml): menu and order endpoints; documentation only, with no running backend.
- [SQL schema](schema.sql): menu items and orders with a foreign key.
- [YAML config](cafe.yml): opening hours and milk choices.
- [JSON order](order.json): one latte order with oat milk.

## One source of meaning
Prices match the [menu](../menu/menu.md). Staff follow the same [order flow](../operations/order-flow.md) whether the ticket is on paper or a screen.

```json
{"orderId": 101, "status": "queued"}
```

## Embedded database diagram
The same schema can be read without leaving this article. Compare it with the standalone SQL file linked above.

```sql
CREATE TABLE menu_items (
  id INTEGER PRIMARY KEY,
  name VARCHAR(80) NOT NULL,
  price DECIMAL(6,2) NOT NULL
);
CREATE TABLE orders (
  id INTEGER PRIMARY KEY,
  menu_item_id INTEGER NOT NULL,
  quantity INTEGER NOT NULL,
  milk VARCHAR(20),
  status VARCHAR(20) NOT NULL,
  FOREIGN KEY (menu_item_id) REFERENCES menu_items(id)
);
INSERT INTO menu_items (id, name, price) VALUES
  (1, 'Espresso', 2.50), (2, 'Latte', 4.00), (3, 'Iced tea', 3.00);
```

## Embedded API reference
Expand an endpoint below to inspect its request and response. This is the same documentation-only API as the standalone YAML file; no backend is running.

```yaml
openapi: 3.0.3
info:
  title: Little Café Ordering API
  version: 1.0.0
  description: Documentation-only example. No live service is included.
paths:
  /menu:
    get:
      summary: List drinks
      operationId: listMenu
      responses:
        '200':
          description: Available drinks
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/MenuItem'
              example:
                - {id: 1, name: Espresso, price: 2.50}
                - {id: 2, name: Latte, price: 4.00}
                - {id: 3, name: Iced tea, price: 3.00}
  /orders:
    post:
      summary: Create a drink order
      operationId: createOrder
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/NewOrder'
            example: {menu_item_id: 2, quantity: 1, milk: oat}
      responses:
        '201':
          description: Order queued
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Order'
              example: {id: 101, menu_item_id: 2, quantity: 1, milk: oat, status: queued, total: 4.00}
components:
  schemas:
    MenuItem:
      type: object
      required: [id, name, price]
      properties:
        id: {type: integer}
        name: {type: string}
        price: {type: number, format: float}
    NewOrder:
      type: object
      required: [menu_item_id, quantity, milk]
      properties:
        menu_item_id: {type: integer}
        quantity: {type: integer, minimum: 1}
        milk: {type: string, enum: [dairy, oat]}
    Order:
      allOf:
        - $ref: '#/components/schemas/NewOrder'
        - type: object
          required: [id, status, total]
          properties:
            id: {type: integer}
            status: {type: string, enum: [queued, preparing, ready]}
            total: {type: number, format: float}
```

## Follow a wiki link
Atlas Docs also supports a short wiki link to a document ID: [[menu/latte]]. Follow it to the recipe, then inspect incoming links to find this article again.
