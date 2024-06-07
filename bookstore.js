const path = require('path');
require('dotenv').config({
    override: true, // Prioritaskan variabel di file .env daripada variabel lingkungan sistem
    path: path.join(__dirname, 'development.env') // Buat jalur absolute ke file development.env
});
const { Pool } = require('pg'); // impor kelas Pool dari module pg 
const express = require('express'); //Impor Express framework
const app = express(); //Membuat aplikasi Express
const PORT = process.env.APP_PORT || 3880; // Mengatur PORT untuk server aplikasi

app.use(express.json()); //Urai body request HTTP format json

const pool = new Pool({
    user: process.env.USER,
    host: process.env.HOST,
    database: process.env.DATABASE,
    password: process.env.PASSWORD,
    port: process.env.DB_PORT // Menggunakan variabel lingkungan untuk port database
});



// Endpoint untuk mendapatkan semua informasi buku yang tersedia
app.get('/api/books', async (req, res) => { //Definisikan route GET untuk endpoint /api/books
    try {
        const client = await pool.connect(); //Mendapatkan client dari pool koneksi
        const { rows } = await client.query('SELECT * FROM Info_Book'); //Run query untuk dapatkan semua data buku dari tabel view Info_Book
        res.json(rows); //Kirimkan hasil query dalam format json as reponse
        client.release(); //Lepaskan client kembali ke pool agar dapat digunakan untuk request lainnya
      } catch (err) { //Error Handling
        console.error(err);
        res.status(500).json({ message: 'Internal Server Error' });
      }
});



// Endpoint untuk mendapatkan buku berdasarkan author
app.get('/api/books/author/:author', async (req, res) => {
  const { author } = req.params; // Ambil nilai parameter URL 'author'
  try {
      const client = await pool.connect(); // Mendapatkan client dari pool koneksi
      const query = 'SELECT * FROM Info_Book WHERE name_author = $1';
      const values = [author];

      const { rows } = await client.query(query, values); // Jalankan query dengan parameter
      res.json(rows); // Kirimkan hasil query dalam format JSON sebagai respons
      client.release(); // Lepaskan client kembali ke pool agar dapat digunakan untuk request lainnya
  } catch (err) {
      console.error(err); // Mencetak kesalahan ke konsol
      res.status(500).json({ message: 'Internal Server Error' }); // Mengirim respons kesalahan ke klien
  }
});



//Endpoint untuk mendapatkan informasi buku hanya berdasarkan keyword pencarian
app.get('/api/books/search', async (req, res) => {
  let { keyword } = req.query; // Ambil nilai parameter query 'keyword'

  //Cek apakah keyword merupakan numerik
  if (!isNaN(keyword)) {
    //Jika keyword numerik, konversi menjadi teks
    keyword = keyword.toString();
  }
 
  try {
      const client = await pool.connect(); // Mendapatkan client dari pool koneksi
      const query = `
        SELECT * 
        FROM Info_Book 
        WHERE 
          title_book ILIKE $1 OR 
          name_category ILIKE $1 OR 
          description_category ILIKE $1 OR 
          isbn::text ILIKE $1 OR 
          name_author ILIKE $1 OR
          name_publisher ILIKE $1 OR
          price::text ILIKE $1 OR
          publication_year::text ILIKE $1
      `;
      const values = [`%${keyword}%`];

      const { rows } = await client.query(query, values); // Jalankan query dengan parameter
      res.json(rows); // Kirimkan hasil query dalam format JSON sebagai respons
      client.release(); // Lepaskan client kembali ke pool agar dapat digunakan untuk request lainnya
  } catch (err) {
      console.error(err); // Mencetak kesalahan ke konsol
      res.status(500).json({ message: 'Internal Server Error' }); // Mengirim respons kesalahan ke klien
  }
});



// Endpoint untuk menambahkan data customer online atau memperbarui data jika sudah ada
app.post('/api/customers', async (req, res) => {
  const { name, address, phone } = req.body; // Ambil nilai-nilai params URL 
  try {
    const client = await pool.connect(); // Mendapatkan client dari pool koneksi
    try {
      await client.query('BEGIN'); // Mulai transaksi
      
      // Periksa apakah data customer sudah ada
      const checkCustomerQuery = 'SELECT * FROM Customer_Online WHERE name_customer_online = $1';
      const checkCustomerValues = [name];
      const checkCustomerResult = await client.query(checkCustomerQuery, checkCustomerValues);

      if (checkCustomerResult.rows.length > 0) {
        // Jika data customer sudah ada, lakukan update
        const updateCustomerQuery = 'UPDATE Customer_Online SET address = $1, phone = $2 WHERE name_customer_online = $3 RETURNING *';
        const updateCustomerValues = [address, phone, name];
        const { rows } = await client.query(updateCustomerQuery, updateCustomerValues);
        res.status(200).json({ message: 'Customer data updated successfully ' }); // Kirimkan pesan
      } else {
        // Jika data customer belum ada, tambahkan customer baru
        const insertCustomerQuery = 'INSERT INTO Customer_Online (name_customer_online, address, phone) VALUES ($1, $2, $3) RETURNING *';
        const insertCustomerValues = [name, address, phone];
        const { rows } = await client.query(insertCustomerQuery, insertCustomerValues);
        res.status(201).json({ message: 'New customer data created successfully' }); // Kirimkan pesan 
      }

      // Akhir transaksi
      await client.query('COMMIT');
    } catch (err) {
      // Jika terjadi kesalahan, batalkan transaksi
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release(); // Lepaskan client kembali ke pool agar dapat digunakan untuk request lainnya
    }
  } catch (err) { // Error Handling
    console.error(err);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});



// Endpoint untuk mendaftarkan customer online pada akun pengguna online bookstore atau memperbarui data akun jika sudah ada
app.post('/api/account', async (req, res)=>{
  const { name, username, password, email } = req.body; //Ambil nilai params URL 
  try {
    const client = await pool.connect(); // Mendapatkan client dari pool koneksi
    await client.query('BEGIN'); //Mulai transaksi

    try {
      //Dapatkan customer_on_id dari tabel Customer_Online berdasarkan nama customer
      const customerQuery = 'SELECT customer_on_id FROM Customer_Online WHERE name_customer_online = $1';
      const nameValue = [name];
      const customerResult = await client.query(customerQuery, nameValue);
      
      // Periksa apakah hasil query kosong
      if (customerResult.rows.length === 0) {
        throw new Error('Customer not found'); // Melempar error jika customer tidak ditemukan
      }
      
      const customerId = customerResult.rows[0].customer_on_id;

      // Periksa apakah pengguna dengan nama pengguna tertentu sudah ada dalam tabel User_Account
      const checkUserQuery = 'SELECT * FROM User_Account WHERE username = $1';
      const checkUserValues = [username];
      const checkUserResult = await client.query(checkUserQuery, checkUserValues);

      if (checkUserResult.rows.length > 0) {
        // Jika pengguna sudah ada, lakukan update data pengguna
        const updateUserQuery = 'UPDATE User_Account SET customer_on_id = $1, passwordu = $2, email = $3 WHERE username = $4 RETURNING *';
        const updateUserValues = [customerId, password, email, username];
        const { rows } = await client.query(updateUserQuery, updateUserValues);
        res.status(200).json({ message: 'User account updated successfully' });
      } else {
        // Jika pengguna belum ada, tambahkan pengguna baru ke tabel User_Account
        const insertUserQuery = 'INSERT INTO User_Account (customer_on_id, username, passwordu, email) VALUES ($1, $2, $3, $4) RETURNING *';
        const insertUserValues = [customerId, username, password, email];
        const { rows } = await client.query(insertUserQuery, insertUserValues);
        res.status(201).json({ message: 'New user account created successfully' });
      }

      //Akhir transaksi
      await client.query('COMMIT');
    } catch (err) {
      // Jika terjadi kesalahan, batalkan transaksi
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release(); // Lepaskan client kembali ke pool agar dapat digunakan untuk request lainnya
    }
  } catch (err) { // Error Handling
    console.error(err);
    res.status(500).json({ message: err.message || 'Internal Server Error' }); // Mengirim pesan error jika tersedia, jika tidak, kirim pesan default
  }
});



// Endpoint untuk menambahkan item ke dalam wishlist customer atau memperbarui data jika sudah ada
app.post('/api/wishlist-item', async (req, res) => {
  const { customerName, bookName, quantity } = req.body; // Ambil nilai-nilai params URL 
  try {
    const client = await pool.connect(); // Mendapatkan client dari pool koneksi
    await client.query('BEGIN'); // Mulai transaksi

    try {
      // Dapatkan customer_on_id dari tabel Customer_Online berdasarkan nama customer
      const customerQuery = 'SELECT customer_on_id FROM Customer_Online WHERE name_customer_online = $1';
      const customerValue = [customerName];
      const customerResult = await client.query(customerQuery, customerValue);

      // Periksa apakah hasil query kosong
      if (customerResult.rows.length === 0) {
        throw new Error('Customer not found'); // Melempar error jika customer tidak ditemukan
      }

      const customerId = customerResult.rows[0].customer_on_id;

      // Dapatkan wishlist_id dari tabel Wishlist menggunakan customer_on_id
      const wishlistQuery = 'SELECT wishlist_id FROM Wishlist WHERE customer_on_id = $1';
      const wishlistValue = [customerId];
      const wishlistResult = await client.query(wishlistQuery, wishlistValue);

      // Periksa apakah hasil query kosong
      if (wishlistResult.rows.length === 0) {
        throw new Error('Wishlist not found for this customer'); // Melempar error jika wishlist tidak ditemukan
      }

      const wishlistId = wishlistResult.rows[0].wishlist_id;

      // Dapatkan book_id dari tabel Book berdasarkan nama buku
      const bookQuery = 'SELECT book_id FROM Book WHERE title = $1';
      const bookValue = [bookName];
      const bookResult = await client.query(bookQuery, bookValue);

      // Periksa apakah hasil query kosong
      if (bookResult.rows.length === 0) {
        throw new Error('Book not found'); // Melempar error jika buku tidak ditemukan
      }

      const bookId = bookResult.rows[0].book_id;

      // Periksa apakah item sudah ada dalam wishlist
      const checkWishlistItemQuery = 'SELECT wishlist_item_id FROM Wishlist_Item WHERE wishlist_id = $1 AND book_id = $2';
      const checkWishlistItemValues = [wishlistId, bookId];
      const checkWishlistItemResult = await client.query(checkWishlistItemQuery, checkWishlistItemValues);

      if (checkWishlistItemResult.rows.length > 0) {
        // Jika item sudah ada, lakukan update
        const updateWishlistItemQuery = 'UPDATE Wishlist_Item SET quantity_order = $1 WHERE wishlist_id = $2 AND book_id = $3 RETURNING *';
        const updateWishlistItemValues = [quantity, wishlistId, bookId];
        const { rows } = await client.query(updateWishlistItemQuery, updateWishlistItemValues);
        
        // Akhir transaksi
        await client.query('COMMIT');
        
        res.status(200).json({ message: 'Wishlist item updated successfully', item: rows[0] }); // Kirimkan hasil query dalam format json sebagai response
      } else {
        // Jika item belum ada, tambahkan data baru ke dalam tabel Wishlist_Item
        const insertWishlistItemQuery = 'INSERT INTO Wishlist_Item (wishlist_id, book_id, quantity_order) VALUES ($1, $2, $3) RETURNING *';
        const insertWishlistItemValues = [wishlistId, bookId, quantity];
        const { rows } = await client.query(insertWishlistItemQuery, insertWishlistItemValues);

        // Akhir transaksi
        await client.query('COMMIT');

        res.status(201).json({ message: 'Item successfully added to wishlist', item: rows[0] }); // Kirimkan hasil query dalam format json sebagai response
      }
    } catch (err) {
      // Jika terjadi kesalahan, batalkan transaksi
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release(); // Lepaskan client kembali ke pool agar dapat digunakan untuk request lainnya
    }
  } catch (err) { // Error Handling
    console.error(err);
    res.status(500).json({ message: err.message || 'Internal Server Error' }); // Mengirim pesan error jika tersedia, jika tidak, kirim pesan default
  }
});



// Endpoint untuk menghapus item dari wishlist
app.delete('/api/wishlist-item', async (req, res) => {
  const { customerName, bookName, quantity } = req.body; // Ambil nilai-nilai params URL 
  try {
    const client = await pool.connect(); // Mendapatkan client dari pool koneksi
    await client.query('BEGIN'); // Mulai transaksi

    try {
      // Dapatkan customer_on_id dari tabel Customer_Online berdasarkan nama customer
      const customerQuery = 'SELECT customer_on_id FROM Customer_Online WHERE name_customer_online = $1';
      const customerValue = [customerName];
      const customerResult = await client.query(customerQuery, customerValue);

      // Periksa apakah hasil query kosong
      if (customerResult.rows.length === 0) {
        throw new Error('Customer not found'); // Melempar error jika customer tidak ditemukan
      }

      const customerId = customerResult.rows[0].customer_on_id;

      // Dapatkan wishlist_id dari tabel Wishlist menggunakan customer_on_id
      const wishlistQuery = 'SELECT wishlist_id FROM Wishlist WHERE customer_on_id = $1';
      const wishlistValue = [customerId];
      const wishlistResult = await client.query(wishlistQuery, wishlistValue);

      // Periksa apakah hasil query kosong
      if (wishlistResult.rows.length === 0) {
        throw new Error('Wishlist not found for this customer'); // Melempar error jika wishlist tidak ditemukan
      }

      const wishlistId = wishlistResult.rows[0].wishlist_id;

      // Dapatkan book_id dari tabel Book berdasarkan nama buku
      const bookQuery = 'SELECT book_id FROM Book WHERE title = $1';
      const bookValue = [bookName];
      const bookResult = await client.query(bookQuery, bookValue);

      // Periksa apakah hasil query kosong
      if (bookResult.rows.length === 0) {
        throw new Error('Book not found'); // Melempar error jika buku tidak ditemukan
      }

      const bookId = bookResult.rows[0].book_id;

      // Periksa apakah item ada dalam wishlist dengan quantity yang sesuai
      const checkWishlistItemQuery = 'SELECT wishlist_item_id FROM Wishlist_Item WHERE wishlist_id = $1 AND book_id = $2 AND quantity_order = $3';
      const checkWishlistItemValues = [wishlistId, bookId, quantity];
      const checkWishlistItemResult = await client.query(checkWishlistItemQuery, checkWishlistItemValues);

      if (checkWishlistItemResult.rows.length > 0) {
        // Jika item ada, lakukan penghapusan
        const deleteWishlistItemQuery = 'DELETE FROM Wishlist_Item WHERE wishlist_id = $1 AND book_id = $2 AND quantity_order = $3 RETURNING *';
        const deleteWishlistItemValues = [wishlistId, bookId, quantity];
        const { rows } = await client.query(deleteWishlistItemQuery, deleteWishlistItemValues);
        
        // Akhir transaksi
        await client.query('COMMIT');
        
        res.status(200).json({ message: 'Wishlist item deleted successfully', item: rows[0] }); // Kirimkan hasil query dalam format json sebagai response
      } else {
        // Jika item tidak ditemukan
        await client.query('ROLLBACK');
        res.status(404).json({ message: 'Wishlist item not found' });
      }
    } catch (err) {
      // Jika terjadi kesalahan, batalkan transaksi
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release(); // Lepaskan client kembali ke pool agar dapat digunakan untuk request lainnya
    }
  } catch (err) { // Error Handling
    console.error(err);
    res.status(500).json({ message: err.message || 'Internal Server Error' }); // Mengirim pesan error jika tersedia, jika tidak, kirim pesan default
  }
});



// Endpoint untuk mendapatkan semua wishlist customer pada Bookstore Online ini
app.get('/api/wishlistCustomers', async (req, res) => { //Definisikan route GET untuk endpoint 
  try {
      const client = await pool.connect(); //Mendapatkan client dari pool koneksi
      const { rows } = await client.query('SELECT * FROM Wihslist_Customer'); //Run query untuk dapatkan semua data wishlist dari tabel Wihslist_Customer
      res.json(rows); //Kirimkan hasil query dalam format json as reponse
      client.release(); //Lepaskan client kembali ke pool agar dapat digunakan untuk request lainnya
    } catch (err) { //Error Handling
      console.error(err);
      res.status(500).json({ message: 'Internal Server Error' });
    }
})



app.listen(PORT, () => { //Jalankan server Express pada port
  console.log(`Server is running on port ${PORT}`);
});