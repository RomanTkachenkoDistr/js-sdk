describe("integration tests", function () {
    // We need to wait for a ledger to close
    const TIMEOUT = 20 * 1000;
    this.timeout(TIMEOUT);
    this.slow(TIMEOUT / 2);

    StellarSdk.Network.useTestNetwork();

    // Docker
    let server = new StellarSdk.Server('http://127.0.0.1:8000', {allowHttp: true});
    //let server = new StellarSdk.Server('http://192.168.59.103:32773', {allowHttp: true});
    let master = StellarSdk.Keypair.master();

    before(function (done) {
        this.timeout(60 * 1000);
        checkConnection(done);
    });
    var debitor = StellarSdk.Keypair.random();
    var creditor = StellarSdk.Keypair.random();
    var dest = StellarSdk.Keypair.random();

    // function  CreateAcc(public_key) {
    //     (async () => {
    //         const data = await createNewAccount(public_key).then(result => {
    //             //)expect(result.ledger).to.be.not.null;
    //             console.log("first" + result);
    //         });
    //     })
    // }


    function createNewAccount(accountId) {
        return server.loadAccount(master.publicKey())
            .then(source => {
                let tx = new StellarSdk.TransactionBuilder(source)
                    .addOperation(StellarSdk.Operation.createAccount({
                        destination: accountId,
                        startingBalance: "20000000"
                    }))
                    .build();

                tx.sign(master);

                return server.submitTransaction(tx);
            });
    }

    function createAccounts() {
        return createNewAccount(creditor.publicKey())
            .then(function () {
               return createNewAccount(debitor.publicKey())
                    .then(function () {
                       return createNewAccount(dest.publicKey())
                    })
                    .catch(err =>{
                        console.log(err.message)
                    });

            })
            .catch(err =>{
                console.log(err.message)
            });
    }


    function checkConnection(done) {
        server.loadAccount(master.publicKey())
            .then(source => {
                console.log('Horizon up and running!');
                done();
            })
            .catch(err => {
                console.log("Couldn't connect to Horizon... Trying again.");
                setTimeout(() => checkConnection(done), 2000);
            });
    }

    function manageDirectDebit(opts) {
        return server.loadAccount(opts.source)
            .then(source => {
                let tx = new StellarSdk.TransactionBuilder(source)
                    .addOperation(StellarSdk.Operation.manageDebit({
                        asset: opts.asset,
                        debitor: opts.destination,
                        cancelDebit: opts.cancel,
                    }))
                    .build();
                var creditorKp = StellarSdk.Keypair.fromSecret(opts.sourceSecret);//opts.sourceSecret);
                tx.sign(creditorKp);
                return server.submitTransaction(tx);
            });
    }
    function directDebitPayment(opts){
        return server.loadAccount(opts.source)
            .then(source =>{
                let tx = new StellarSdk.TransactionBuilder(source)
                    .addOperation(StellarSdk.Operation.debitPayment({
                        destination:opts.destination,
                        asset:opts.asset,
                        creditor:opts.creditor,
                        amount:opts.amount,
                    }))
                    .build();
                var debitorKp = StellarSdk.Keypair.fromSecret(opts.sourceSecret);
                tx.sign(debitorKp);
                return server.submitTransaction(tx);
            });
    }

    describe("/transaction", function () {
        it("submits a new transaction", function (done) {
            createNewAccount(StellarSdk.Keypair.random().publicKey())
                .then(result => {
                    expect(result.ledger).to.be.not.null;
                    done();
                })
                .catch(err => done(err));
        });

        it("submits a new transaction with error", function (done) {
            server.loadAccount(master.publicKey())
                .then(source => {
                    source.incrementSequenceNumber(); // This will cause an error
                    let tx = new StellarSdk.TransactionBuilder(source)
                        .addOperation(StellarSdk.Operation.createAccount({
                            destination: StellarSdk.Keypair.random().publicKey(),
                            startingBalance: "20"
                        }))
                        .build();

                    tx.sign(master);

                    server.submitTransaction(tx)
                        .then(result => done(new Error("This promise should be rejected.")))
                        .catch(error => {
                            expect(error.data.extras.result_codes.transaction).to.equal('tx_bad_seq');
                            done();
                        });
                });
        });
        it("create direct debit success", function (done) {
            var asset = StellarSdk.Asset.native();
            var opts = {
                source: creditor.publicKey(),
                destination: debitor.publicKey(),
                asset: asset,
                cancel: false,
                sourceSecret: creditor.secret(),
            };
            createAccounts().then(function () {
                    manageDirectDebit(opts)
                        .then(result => {
                            expect(result.ledger).to.be.not.null;
                            done();
                        })
                        .catch(err =>{
                            console.log(err.data.extras.result_codes.transaction);
                            done(err)});
                })
                .catch(err => done(err));

        });
        it("debit payment succes",function (done) {
            var asset = StellarSdk.Asset.native();
            var opts = {
                source: debitor.publicKey(),
                destination: dest.publicKey(),
                asset: asset,
                creditor: creditor.publicKey(),
                sourceSecret: debitor.secret(),
                amount:"101",
            };
            directDebitPayment(opts)
                .then(result =>{
                    expect(result.ledger).to.be.not.null;
                    done();
                })
                .catch(err =>{
                   console.log(err.data.extras.result_codes.transaction);
                    done(err)});
        });
        it("delete direct debit success", function (done) {
            var asset = StellarSdk.Asset.native();
            var opts = {
                source: creditor.publicKey(),
                destination: debitor.publicKey(),
                asset: asset,
                cancel: true,
                sourceSecret: creditor.secret(),
            };

            manageDirectDebit(opts)
                .then(result => {
                    expect(result.ledger).to.be.not.null;
                    done();
                })
                .catch(err => {
                    console.log(err.data.extras.result_codes.transaction);
                    done(err)
                });


        });

    });
    // describe("/accounts", function () {
    //   it("lists all accounts", function (done) {
    //     server.accounts()
    //       .call()
    //       .then(accounts => {
    //         // The first account should be a master account
    //         expect(accounts.records[0].account_id).to.equal(master.publicKey());
    //         done();
    //       });
    //   });
    //
    //   it("stream accounts", function (done) {
    //     this.timeout(10*1000);
    //     let randomAccount = StellarSdk.Keypair.random();
    //
    //     let eventStreamClose = server.accounts()
    //       .cursor('now')
    //       .stream({
    //         onmessage: account => {
    //           expect(account.account_id).to.equal(randomAccount.publicKey());
    //           done();
    //         }
    //       });
    //
    //     createNewAccount(randomAccount.publicKey());
    //     setTimeout(() => eventStreamClose(), 10*1000);
    //   });
    // });
});
