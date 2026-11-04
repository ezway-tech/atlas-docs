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
