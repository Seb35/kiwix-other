#ifndef APPIMPL_H
#define APPIMPL_H

#include "ui_source.h"

class AppImpl : public QDialog, public Ui::App
{
    Q_OBJECT

    public:

            AppImpl( QWidget * parent = 0, Qt::WFlags f = 0 );
            QString lang;

    public slots:

            bool filexist(const char *filename);
            void runapp(const char *filename,int windowsmodal);
            void msgerror(int coderror);
            void retranslateUi();
            void launch();
            void install();
            void clean();
            void quit();

    private slots:

            QMap<QString, QString> parseXML();
};
#endif
