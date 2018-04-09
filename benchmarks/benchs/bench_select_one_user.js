const assert = require("assert");

module.exports.title = "select one mysql.user and 1 integer";
module.exports.displaySql = "select <all mysql.user fields>, 1 from mysql.user u LIMIT 1";

module.exports.benchFct = function(conn, deferred) {
  conn.query(
    "select u.Host,\n" +
      "u.User,\n" +
      "u.Password,\n" +
      "u.Select_priv,\n" +
      "u.Insert_priv,\n" +
      "u.Update_priv,\n" +
      "u.Delete_priv,\n" +
      "u.Create_priv,\n" +
      "u.Drop_priv,\n" +
      "u.Reload_priv,\n" +
      "u.Shutdown_priv,\n" +
      "u.Process_priv,\n" +
      "u.File_priv,\n" +
      "u.Grant_priv,\n" +
      "u.References_priv,\n" +
      "u.Index_priv,\n" +
      "u.Alter_priv,\n" +
      "u.Show_db_priv,\n" +
      "u.Super_priv,\n" +
      "u.Create_tmp_table_priv,\n" +
      "u.Lock_tables_priv,\n" +
      "u.Execute_priv,\n" +
      "u.Repl_slave_priv,\n" +
      "u.Repl_client_priv,\n" +
      "u.Create_view_priv,\n" +
      "u.Show_view_priv,\n" +
      "u.Create_routine_priv,\n" +
      "u.Alter_routine_priv,\n" +
      "u.Create_user_priv,\n" +
      "u.Event_priv,\n" +
      "u.Trigger_priv,\n" +
      "u.Create_tablespace_priv,\n" +
      "u.ssl_type,\n" +
      "u.ssl_cipher,\n" +
      "u.x509_issuer,\n" +
      "u.x509_subject,\n" +
      "u.max_questions,\n" +
      "u.max_updates,\n" +
      "u.max_connections,\n" +
      "u.max_user_connections,\n" +
      "u.plugin,\n" +
      "u.authentication_string,\n" +
      "u.password_expired,\n" +
      "u.is_role,\n" +
      "u.default_role,\n" +
      "u.max_statement_time , 50000000 as t" +
      " from mysql.user u LIMIT 1",
    function(err, rows, fields) {
      if (err) console.log(err);
      assert.ifError(err);
      assert.equal(50000000, rows[0]["t"]);

      deferred.resolve();
    }
  );
};
